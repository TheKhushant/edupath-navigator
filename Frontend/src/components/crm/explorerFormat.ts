import type {
  ExplorerCourse,
  ExplorerCountryInfo,
  ExplorerUniversity,
  ExplorerUniversityRef,
} from "@/types/crm";

/* =========================================================
   Display helpers shared by the explorer and the student
   presentation. Every helper returns only values that are
   actually recorded, so null / undefined / "" never render.
========================================================= */

export type Fact = { label: string; value: string };

export const filled = (value: unknown): value is string | number => {
  // Booleans come from `condition && value` expressions, never displayable
  if (value === null || value === undefined || typeof value === "boolean") return false;
  const text = String(value).trim();
  return text !== "" && text !== "null" && text !== "undefined" && text !== "NaN";
};

export const joinFilled = (parts: unknown[], separator = " · ") =>
  parts.filter(filled).map(String).join(separator);

export const listFilled = (values: unknown[] | undefined) =>
  (values ?? []).filter(filled).map(String);

/** Only http(s) links are rendered as links. */
export const safeUrl = (url: unknown) =>
  typeof url === "string" && /^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : undefined;

function formatAmount(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-IE")}`;
  }
}

export function moneyRange(min?: number, max?: number, currency = "EUR") {
  const low = typeof min === "number" && Number.isFinite(min) ? min : undefined;
  const high = typeof max === "number" && Number.isFinite(max) ? max : undefined;

  if (low === undefined && high === undefined) return undefined;
  if (!low && !high) return "No tuition fees";
  if (low === undefined || high === undefined || low === high) {
    return formatAmount((low ?? high) as number, currency);
  }
  return `${formatAmount(low, currency)} – ${formatAmount(high, currency)}`;
}

export const courseUniversity = (course: ExplorerCourse): ExplorerUniversityRef | undefined =>
  typeof course.universityId === "object" && course.universityId ? course.universityId : undefined;

export const courseUniversityName = (course: ExplorerCourse) =>
  course.universityName || courseUniversity(course)?.name;

export const courseLocation = (course: ExplorerCourse) => {
  const university = courseUniversity(course);
  return joinFilled(
    [course.city || university?.city, course.state || university?.state, university?.country],
    ", ",
  );
};

export const universityLocation = (university: ExplorerUniversity) =>
  joinFilled([university.city, university.state, university.country], ", ");

export const courseTuition = (course: ExplorerCourse) => {
  const range = moneyRange(course.tuitionMin, course.tuitionMax, course.tuitionCurrency || "EUR");
  if (range) return joinFilled([range, course.tuitionPeriod && `per ${course.tuitionPeriod}`], " ");
  return filled(course.tuitionFee) ? course.tuitionFee : undefined;
};

/** University tuition figures come from the "Annual Tuition Fee (EUR)" data. */
export const universityTuition = (university: ExplorerUniversity) => {
  const range = moneyRange(university.tuitionFeeMin, university.tuitionFeeMax, "EUR");
  return range
    ? `${range} per year`
    : filled(university.annualTuitionFee)
      ? university.annualTuitionFee
      : undefined;
};

export const courseUrl = (course: ExplorerCourse) =>
  safeUrl(course.programmeUrl) ?? safeUrl(course.sourceUrl);

export const universityRanking = (ranking?: string, source?: string) =>
  filled(ranking)
    ? joinFilled([/^\d/.test(ranking) ? `#${ranking}` : ranking, source], " · ")
    : undefined;

const fact = (label: string, value: unknown): Fact | null =>
  filled(value) ? { label, value: String(value) } : null;

const facts = (list: (Fact | null)[]) => list.filter((item): item is Fact => item !== null);

export function courseFacts(course: ExplorerCourse): Fact[] {
  const university = courseUniversity(course);

  return facts([
    fact("Degree", course.degree),
    fact("Specialization", course.specialization),
    fact("Subject", course.subjectArea || course.canonicalCourse),
    fact("Language", course.language),
    fact("Duration", joinFilled([course.duration, filled(course.ects) && `${course.ects} ECTS`])),
    fact("Study mode", course.studyMode),
    fact("Intake", course.intake),
    fact("Application opens", course.applicationStartDate),
    fact("Deadline", course.applicationDeadline),
    fact("Tuition", courseTuition(course)),
    fact("Application fee", course.applicationFee),
    fact("Application method", course.applicationMethod || university?.portal),
    fact("Admission", course.admissionMode),
    fact("IELTS", course.ielts),
    fact("TOEFL", course.toefl),
    fact("GRE", course.gre),
    fact("Required degree", course.requiredDegree),
    fact("Minimum GPA", course.minimumGpa),
    fact("Entrance exam", course.entranceExam),
    fact("Interview", course.interview),
  ]);
}

export function universityFacts(university: ExplorerUniversity): Fact[] {
  return facts([
    fact("Location", universityLocation(university)),
    fact("University type", university.universityType),
    fact("Ranking", universityRanking(university.ranking, university.rankingSource)),
    fact("Tuition", universityTuition(university)),
    fact(
      "Tuition notes",
      university.annualTuitionFee !== universityTuition(university)
        ? university.annualTuitionFee
        : undefined,
    ),
    fact("Application fee", university.applicationFee),
    fact("Application opens", university.applicationOpens),
    fact("Deadline", university.applicationDeadline),
    fact("Intake", listFilled(university.intake).join(", ")),
    fact("Application method", university.portal),
    fact("English (IELTS)", university.englishRequirement),
    fact("Recommended Indian %", university.recommendedIndianPercentage),
    fact("APS", university.aps),
    fact("SOP", university.sop),
    fact("LOR", university.lor),
    fact("Scholarship", university.scholarship),
    fact("Part-time work", university.partTime),
    fact("Post-study work", university.postStudyWork),
    fact("Financial proof", university.financialProof),
    fact(
      "Living cost",
      moneyRange(university.livingCostMin, university.livingCostMax, "EUR") &&
        `${moneyRange(university.livingCostMin, university.livingCostMax, "EUR")} per year`,
    ),
  ]);
}

/** Admission steps, documents and intakes recorded for the country. */
export function countryFacts(country?: ExplorerCountryInfo | null) {
  if (!country) return { documents: [], steps: [], intakes: [], livingCost: undefined };

  const livingCost = moneyRange(
    country.livingCostMin,
    country.livingCostMax,
    country.livingCostCurrency || "EUR",
  );

  return {
    documents: (country.requiredDocuments ?? [])
      .filter((item) => filled(item.document))
      .map((item) => joinFilled([item.document, item.mandatory && `(${item.mandatory})`], " ")),
    steps: (country.admissionSteps ?? []).map((item) => item.process).filter(filled),
    intakes: (country.intakes ?? [])
      .filter((item) => filled(item.intake))
      .map((item) =>
        joinFilled(
          [
            item.intake,
            item.applicationStart && `opens ${item.applicationStart}`,
            item.applicationDeadline && `deadline ${item.applicationDeadline}`,
          ],
          " · ",
        ),
      ),
    livingCost:
      livingCost &&
      joinFilled([livingCost, country.livingCostPeriod && `per ${country.livingCostPeriod}`], " "),
  };
}
