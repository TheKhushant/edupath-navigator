import type {
  Country,
  LivingBudget,
  MatchAction,
  MatchStatus,
  Student,
  University,
  UniversityMatch,
} from "@/types/crm";

/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

const clean = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** Lowercase, "&" → "and", strip punctuation, collapse whitespace. */
export const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9%.+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Common course abbreviations, expanded so "AI" matches "Artificial Intelligence". */
const COURSE_ABBREVIATIONS: Record<string, string> = {
  ai: "artificial intelligence",
  ml: "machine learning",
  cs: "computer science",
  cse: "computer science",
  it: "information technology",
  ds: "data science",
  ee: "electrical engineering",
  ece: "electronics and communication engineering",
  mech: "mechanical engineering",
};

/** Degree names and filler words that say nothing about the subject. */
const COURSE_STOPWORDS = new Set([
  "ms",
  "msc",
  "ma",
  "mtech",
  "meng",
  "btech",
  "beng",
  "bsc",
  "ba",
  "be",
  "master",
  "masters",
  "bachelor",
  "bachelors",
  "degree",
  "program",
  "programme",
  "course",
  "in",
  "of",
  "the",
  "and",
]);

const normalizeCourse = (value: string): string =>
  normalizeText(value.replace(/\./g, ""))
    .split(" ")
    .map((word) => COURSE_ABBREVIATIONS[word] ?? word)
    .join(" ")
    .split(" ")
    .filter((word) => word && !COURSE_STOPWORDS.has(word))
    .join(" ");

/** Split "VLSI & Embedded Systems" / "Finance, Analytics" into separate subject phrases. */
const toCoursePhrases = (value: string): string[] =>
  clean(value)
    .split(/[,/&;]|\band\b/i)
    .map(normalizeCourse)
    .filter((phrase) => phrase.length >= 2);

const containsWords = (text: string, words: string) => ` ${text} `.includes(` ${words} `);

const coursesMatch = (studentPhrase: string, universityCourse: string) =>
  containsWords(universityCourse, studentPhrase) || containsWords(studentPhrase, universityCourse);

/** All numbers in a string, e.g. "0-6000 (Semester fees)" → [0, 6000]. */
const extractNumbers = (value: string): number[] =>
  [...value.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter((number) => Number.isFinite(number));

/** IELTS band from text such as "6.5" or "IELTS 6.5 overall". */
export const parseIelts = (value: unknown): number | undefined => {
  const band = extractNumbers(clean(value)).find((number) => number > 0 && number <= 9);
  return band;
};

/** Lower bound of a recommended percentage such as "75-85%+". */
export const parseMinimumPercentage = (value: unknown): number | undefined => {
  const number = extractNumbers(clean(value))[0];
  return number !== undefined && number > 0 && number <= 100 ? number : undefined;
};

/**
 * Student academic percentage, only when the value is clearly a percentage
 * ("78%", or a number above the 10-point CGPA scale). CGPA values are not
 * converted because the project has no agreed conversion formula.
 */
export const parseStudentPercentage = (value: unknown): number | undefined => {
  const text = clean(value);
  const number = extractNumbers(text)[0];

  if (number === undefined || number > 100) return undefined;
  if (text.includes("%") || number > 10) return number;

  return undefined;
};

/**
 * Student budget in EUR. Only budgets explicitly stated in EUR are parsed,
 * because Sheet2 tuition is in EUR and no exchange rate is configured.
 */
export const parseBudgetEur = (value: unknown): number | undefined => {
  const text = clean(value);

  if (!/€|\beur\b|\beuros?\b/i.test(text)) return undefined;

  const number = extractNumbers(text)[0];
  if (number === undefined) return undefined;

  return /\d\s*k\b/i.test(text) ? number * 1000 : number;
};

/** Tuition range in EUR from stored numbers, falling back to the raw Sheet2 text. */
const getTuitionRange = (
  university: University,
  annualTuitionFee: string,
): { min: number | undefined; max: number | undefined } => {
  if (
    typeof university.tuitionFeeMin === "number" ||
    typeof university.tuitionFeeMax === "number"
  ) {
    const min = university.tuitionFeeMin ?? university.tuitionFeeMax;
    const max = university.tuitionFeeMax ?? university.tuitionFeeMin;
    return { min, max };
  }

  const [min, max] = extractNumbers(annualTuitionFee);
  if (min === undefined) return { min: undefined, max: undefined };

  return { min, max: max ?? min };
};

/** Sheet2 repeats its header row; such rows are not universities. */
export const isSheet2HeaderRow = (university: University) =>
  normalizeText(university.name) === "university" &&
  normalizeText(university.city ?? "") === "city";

/* =========================================================
   MATCHING
========================================================= */

type TuitionFit = "Within Budget" | "Near Budget" | "Above Budget" | "Unknown";

const getTuitionFit = (budgetEur: number | undefined, min?: number, max?: number): TuitionFit => {
  if (budgetEur === undefined || min === undefined || max === undefined) return "Unknown";
  if (max <= budgetEur) return "Within Budget";
  if (min <= budgetEur) return "Near Budget";
  return "Above Budget";
};

/** Country-level living cost, only when the country record actually has it. */
const getLivingBudget = (country?: Country): LivingBudget | undefined => {
  if (
    !country ||
    country.livingCostMin === undefined ||
    country.livingCostMax === undefined ||
    !country.livingCostCurrency ||
    !country.livingCostPeriod
  ) {
    return undefined;
  }

  const budget: LivingBudget = {
    min: country.livingCostMin,
    max: country.livingCostMax,
    currency: country.livingCostCurrency,
    period: country.livingCostPeriod,
  };

  if (country.livingCostSource) budget.source = country.livingCostSource;

  return budget;
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const monthsIn = (value: string) => {
  const words = normalizeText(value).split(" ");
  return MONTHS.filter((month) => words.includes(month) || words.includes(month.slice(0, 3)));
};

const getStatus = (
  profileFit: boolean,
  eligibilityFailed: boolean,
  eligibilityUnknown: boolean,
): MatchStatus => {
  if (!profileFit) return "Review Required";
  if (eligibilityFailed) return "Requirement Review Needed";
  if (eligibilityUnknown) return "Matching";
  return "Meets Published Requirements";
};

const ACTION_BY_STATUS: Record<MatchStatus, MatchAction> = {
  "Meets Published Requirements": "Shortlist",
  Matching: "Verify",
  "Requirement Review Needed": "Review",
  "Review Required": "Review",
};

export const matchUniversities = (
  student: Student,
  universities: University[],
  countries: Country[] = [],
): UniversityMatch[] => {
  const countryByName = new Map(
    countries.map((country) => [normalizeText(country.country), country]),
  );

  const studentIntakeMonths = monthsIn(student.intake ?? "");

  const preferredCountries = (student.preferredCountries ?? []).map(normalizeText).filter(Boolean);

  const studentPhrases = [
    ...toCoursePhrases(student.desiredCourse ?? ""),
    ...toCoursePhrases(student.specialization ?? ""),
  ];

  const budgetEur = parseBudgetEur(student.budget);
  const studentIelts = parseIelts(student.ielts);
  const studentPercentage = parseStudentPercentage(student.cgpa);

  const results: UniversityMatch[] = [];

  universities.forEach((university, index) => {
    if (!clean(university.name) || isSheet2HeaderRow(university)) return;

    const sheet2 = university.sheet2Data ?? {};

    const country = clean(university.country);
    const city = clean(university.city) || clean(sheet2.City);
    const annualTuitionFee =
      clean(university.annualTuitionFee) || clean(sheet2["Annual Tuition Fee (EUR)"]);
    const englishRequirement = clean(university.englishRequirement) || clean(sheet2.IELTS);
    const recommendedIndianPercentage =
      clean(university.recommendedIndianPercentage) || clean(sheet2["Recommended Indian %"]);
    const applicationOpens =
      clean(university.applicationOpens) || clean(sheet2["Application Opens"]);
    const applicationDeadline =
      clean(university.applicationDeadline) || clean(sheet2["Application Deadline"]);

    const courses = university.popularCourses?.length
      ? university.popularCourses.map(clean).filter(Boolean)
      : clean(sheet2["Major Courses"]).split(",").map(clean).filter(Boolean);

    const requirements = university.requirements?.length
      ? university.requirements.map(clean).filter(Boolean)
      : clean(sheet2["Other Requirements"]).split(";").map(clean).filter(Boolean);

    const matchedCriteria: string[] = [];
    const warnings: string[] = [];
    const missingRequirements: string[] = [];

    // ---------------- COUNTRY ----------------

    const countryMatched = Boolean(country) && preferredCountries.includes(normalizeText(country));

    if (countryMatched) {
      matchedCriteria.push(`Preferred country: ${country}`);
    } else if (preferredCountries.length > 0) {
      warnings.push(`${country || "Country"} is not in the student's preferred countries`);
    } else {
      warnings.push("Student has no preferred countries recorded");
    }

    // ---------------- COURSE ----------------

    const matchedCourses = courses.filter((course) => {
      const normalizedCourse = normalizeCourse(course);
      return (
        normalizedCourse.length > 0 &&
        studentPhrases.some((phrase) => coursesMatch(phrase, normalizedCourse))
      );
    });

    const courseMatched = matchedCourses.length > 0;

    // Only list universities that fit the student's subject. When the student
    // has no course recorded, fall back to listing preferred-country universities.
    if (studentPhrases.length > 0 ? !courseMatched : !countryMatched) return;

    if (courseMatched) {
      matchedCriteria.push(`Course match: ${matchedCourses.join(", ")}`);
    } else {
      warnings.push("Student has no desired course or specialization recorded");
    }

    // ---------------- BUDGET ----------------

    const tuition = getTuitionRange(university, annualTuitionFee);
    const tuitionFit = getTuitionFit(budgetEur, tuition.min, tuition.max);

    if (tuition.max === undefined) {
      warnings.push("Annual tuition fee is not available");
    } else if (budgetEur === undefined) {
      warnings.push(
        student.budget
          ? `Budget "${student.budget}" is not in EUR; tuition (EUR) was not compared`
          : "Student budget is not recorded",
      );
    } else if (tuitionFit === "Within Budget") {
      matchedCriteria.push("Annual tuition is within budget");
    } else if (tuitionFit === "Near Budget") {
      warnings.push("Upper end of annual tuition exceeds budget");
    } else {
      warnings.push("Annual tuition exceeds budget");
    }

    // ---------------- COUNTRY-LEVEL DATA ----------------

    const countryRecord = countryByName.get(normalizeText(country));
    const livingBudget = getLivingBudget(countryRecord);
    const intakes = countryRecord?.intakes ?? [];

    if (!livingBudget) {
      warnings.push("Living cost is not available for this country");
    }

    if (intakes.length > 0 && studentIntakeMonths.length > 0) {
      const intake = intakes.find((item) =>
        monthsIn(item.intake).some((month) => studentIntakeMonths.includes(month)),
      );

      if (intake) {
        matchedCriteria.push(
          `${country} intake: ${intake.intake}` +
            (intake.applicationDeadline ? `, deadline ${intake.applicationDeadline}` : ""),
        );
      } else {
        warnings.push(
          `Student intake "${student.intake}" is not a listed ${country} intake (${intakes
            .map((item) => item.intake)
            .join(", ")})`,
        );
      }
    }

    // ---------------- ADMISSION DIFFICULTY ----------------

    const admissionDifficulty = university.admissionDifficulty ?? [];

    const relevantDifficultyFields = admissionDifficulty
      .filter((entry) =>
        toCoursePhrases(entry.field).some((fieldPhrase) =>
          studentPhrases.some((phrase) => coursesMatch(phrase, fieldPhrase)),
        ),
      )
      .map((entry) => entry.field);

    // ---------------- IELTS ----------------

    let eligibilityFailed = false;
    let eligibilityUnknown = false;

    const requiredIelts = parseIelts(englishRequirement);

    if (requiredIelts === undefined) {
      eligibilityUnknown = true;
      warnings.push("IELTS requirement is not published");
    } else if (studentIelts === undefined) {
      eligibilityUnknown = true;
      missingRequirements.push(`IELTS score (required ${requiredIelts})`);
    } else if (studentIelts >= requiredIelts) {
      matchedCriteria.push(`IELTS ${studentIelts} meets required ${requiredIelts}`);
    } else {
      eligibilityFailed = true;
      missingRequirements.push(`IELTS ${requiredIelts} (student has ${studentIelts})`);
    }

    // ---------------- ACADEMIC % ----------------

    const recommendedMinimum = parseMinimumPercentage(recommendedIndianPercentage);

    if (recommendedMinimum === undefined) {
      eligibilityUnknown = true;
      warnings.push("Recommended Indian % is not published");
    } else if (studentPercentage === undefined) {
      eligibilityUnknown = true;
      warnings.push(
        student.cgpa
          ? `Academic score "${student.cgpa}" is not a percentage; compare manually with ${recommendedIndianPercentage}`
          : "Student academic score is not recorded",
      );
    } else if (studentPercentage >= recommendedMinimum) {
      matchedCriteria.push(
        `Academic ${studentPercentage}% meets recommended ${recommendedIndianPercentage}`,
      );
    } else {
      eligibilityFailed = true;
      missingRequirements.push(
        `Recommended ${recommendedIndianPercentage} (student has ${studentPercentage}%)`,
      );
    }

    // ---------------- RESULT ----------------

    const status = getStatus(
      countryMatched && courseMatched,
      eligibilityFailed,
      eligibilityUnknown,
    );

    const match: UniversityMatch = {
      universityId: clean(university.id) || `university-${index}`,
      university: clean(university.name),
      country,
      matchedCourses,
      courses,
      admissionDifficulty,
      relevantDifficultyFields,
      intakes,
      requiredDocuments: countryRecord?.requiredDocuments ?? [],
      requirements,
      matchedCriteria,
      warnings,
      missingRequirements,
      status,
      action: ACTION_BY_STATUS[status],
    };

    // Optional Sheet2 fields are only set when present, never filled with placeholders.
    const website = clean(university.website);
    if (city) match.city = city;
    if (livingBudget) match.livingBudget = livingBudget;
    if (university.ranking) match.ranking = university.ranking;
    if (university.rankingSource) match.rankingSource = university.rankingSource;
    if (website) match.website = website;
    if (annualTuitionFee) match.annualTuitionFee = annualTuitionFee;
    if (tuition.min !== undefined) match.tuitionMin = tuition.min;
    if (tuition.max !== undefined) match.tuitionMax = tuition.max;
    if (englishRequirement) match.englishRequirement = englishRequirement;
    if (recommendedIndianPercentage)
      match.recommendedIndianPercentage = recommendedIndianPercentage;
    if (applicationOpens) match.applicationOpens = applicationOpens;
    if (applicationDeadline) match.applicationDeadline = applicationDeadline;

    results.push(match);
  });

  return results;
};
