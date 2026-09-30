import { matchUniversities } from "@/services/universityMatcher";
import type {
  AssessmentMatch,
  AssessmentResult,
  Country,
  DocumentRecord,
  MatchStatus,
  Student,
  University,
} from "@/types/crm";

const STATUS_ORDER: MatchStatus[] = [
  "Meets Published Requirements",
  "Matching",
  "Requirement Review Needed",
  "Review Required",
];

const OPEN_DOCUMENT_STATUSES = ["Pending", "Rejected"];

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

/**
 * Builds a profile assessment from real records only: the student profile,
 * the University Matcher results and the student's documents. No text is
 * generated beyond restating those values.
 */
export function buildAssessment(
  student: Student,
  universities: University[],
  countries: Country[],
  documents: DocumentRecord[],
): AssessmentResult {
  const matches = matchUniversities(student, universities, countries).sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  const top = matches.slice(0, 3);
  const meeting = matches.filter((match) => match.status === "Meets Published Requirements").length;

  const course = [student.desiredCourse, student.specialization].filter(Boolean).join(" ");
  const preferred = student.preferredCountries ?? [];

  const summary = [
    `${student.name}: ${student.qualification || "qualification not recorded"}${student.branch ? ` (${student.branch})` : ""}, academic score ${student.cgpa || "not recorded"}, IELTS ${student.ielts || "not recorded"}.`,
    `Looking for ${course || "a course that is not recorded yet"} in ${preferred.length ? preferred.join(", ") : "no preferred country recorded"}, intake ${student.intake || "not confirmed"}.`,
    `${matches.length} universit${matches.length === 1 ? "y lists" : "ies list"} a matching course; ${meeting} meet${meeting === 1 ? "s" : ""} all published requirements.`,
  ].join(" ");

  const studentDocuments = documents.filter(
    (document) =>
      document.studentId === student.id || (document.student && document.student === student.name),
  );

  const assessmentMatches: AssessmentMatch[] = top.map((match) => ({
    university: match.university,
    course: match.matchedCourses.join(", ") || match.courses.slice(0, 3).join(", "),
    status:
      match.status === "Meets Published Requirements"
        ? "Meets Published Requirements"
        : "Requirement Review Needed",
    issue: match.missingRequirements[0] ?? match.warnings[0] ?? "",
    action: match.action === "Shortlist" ? "Shortlist" : "Verify",
  }));

  return {
    summary,
    requirements: top[0]?.matchedCriteria ?? [],
    issues: unique(top.flatMap((match) => [...match.missingRequirements, ...match.warnings])),
    missing: unique(
      studentDocuments
        .filter((document) => OPEN_DOCUMENT_STATUSES.includes(document.status))
        .map((document) => `${document.type} (${document.status})`),
    ),
    countries: preferred,
    courses: course ? [course] : [],
    matches: assessmentMatches,
  };
}
