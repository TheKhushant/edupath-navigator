import type {
  ExcelCustomFieldDefinition,
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

/**
 * Stored URL -> safe absolute http(s) URL, or undefined.
 * "www.tum.de" and "tum.de/path" get https://; other schemes (javascript:,
 * data:, file:, ...), URLs with credentials and malformed values are refused.
 */
export function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  let text = value.trim();
  if (!text || text.length > 2048 || /\s/.test(text)) return undefined;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  if (
    !hasScheme &&
    (/^www\./i.test(text) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]|$)/i.test(text))
  ) {
    text = `https://${text}`;
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** True when a text value is meant as a link (not e.g. a sentence mentioning a site). */
export const looksLikeUrl = (value: unknown) =>
  typeof value === "string" &&
  /^(https?:\/\/|www\.)\S+$/i.test(value.trim()) &&
  Boolean(normalizeUrl(value));

/** Only safe http(s) links are rendered as links. */
export const safeUrl = (url: unknown) => normalizeUrl(url);

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
    // The written annual tuition note, when it says more than the amount above
    fact(
      "Annual tuition",
      course.annualTuitionFee !== courseTuition(course) ? course.annualTuitionFee : undefined,
    ),
    fact(
      "Tuition notes",
      course.tuitionFee !== courseTuition(course) ? course.tuitionFee : undefined,
    ),
    fact("Category", course.category),
    fact("Application fee", course.applicationFee),
    fact("Application method", course.applicationMethod || university?.portal),
    fact("Admission", course.admissionMode),
    fact("IELTS", course.ielts),
    fact("TOEFL", course.toefl),
    fact("GRE", course.gre),
    fact("Required degree", course.requiredDegree),
    fact("Minimum GPA", course.minimumGpa),
    fact("Recommended Indian %", course.recommendedIndianPercentage),
    fact("ECTS required", course.ectsRequired),
    fact("German requirement", course.germanRequirement),
    fact("APS", course.apsRequired),
    fact("Work experience", course.workExperience),
    fact("Backlogs allowed", course.backlogsAllowed),
    fact("Gap allowed", course.gapAllowed),
    fact("Entrance exam", course.entranceExam),
    fact("Interview", course.interview),
  ]);
}

/** "tuitionWaiverOffered" -> "Tuition Waiver Offered" (when no saved label exists). */
const labelFromKey = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());

function customValue(
  value: unknown,
  type?: ExcelCustomFieldDefinition["type"],
): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return listFilled(value).join(", ") || undefined;
  if (type === "date" || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  if (typeof value === "object") {
    return (
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => filled(item))
        .map(([key, item]) => `${key}: ${String(item)}`)
        .join(" · ") || undefined
    );
  }
  return filled(value) ? String(value) : undefined;
}

/**
 * Facts for a record's customFields, labelled with the saved definitions
 * of that entity (definition order), then any key without a definition.
 */
export function customFieldFacts(
  values: Record<string, unknown> | undefined,
  definitions: ExcelCustomFieldDefinition[],
  entity: ExcelCustomFieldDefinition["entity"],
): Fact[] {
  if (!values) return [];

  const known = definitions.filter((definition) => definition.entity === entity);
  const keys = [
    ...known.map((definition) => definition.key).filter((key) => key in values),
    ...Object.keys(values).filter((key) => !known.some((definition) => definition.key === key)),
  ];

  return facts(
    keys.map((key) => {
      const definition = known.find((item) => item.key === key);
      return fact(
        definition?.label ?? labelFromKey(key),
        customValue(values[key], definition?.type),
      );
    }),
  );
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
