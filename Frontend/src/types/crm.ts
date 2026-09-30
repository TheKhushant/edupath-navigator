export type StudentStage =
  | "New Enquiry"
  | "Registration"
  | "Profile Assessment"
  | "University Shortlist"
  | "Documents"
  | "Application"
  | "Offer Received"
  | "Visa"
  | "Departure";

export type RecordStatus = "Active" | "On Hold" | "Archived";

/**
 * Known values of a field the backend stores as free text. Accepts any
 * string (records created through the API may use other values) while
 * keeping the known values for autocomplete and comparisons.
 */
export type KnownOr<T extends string> = T | (string & {});

export type ApplicationStatus =
  | "Not Started"
  | "Draft"
  | "Documents Pending"
  | "Ready to Submit"
  | "Submitted"
  | "Under Review"
  | "Offer Received"
  | "Rejected"
  | "Withdrawn";

export type DocumentStatus = "Pending" | "Uploaded" | "Under Review" | "Approved" | "Rejected";

export type VisaStatus =
  | "Not Started"
  | "Documents Pending"
  | "Ready"
  | "Appointment Scheduled"
  | "Submitted"
  | "Under Review"
  | "Approved"
  | "Rejected";

export type PaymentStatus = "Paid" | "Partial" | "Pending" | "Overdue";

export type FollowUpStatus = "Pending" | "Completed" | "Overdue";

export type ServiceType =
  "Study Abroad" | "Germany Ausbildung" | "Opportunity Card" | "Language Training";

/* =========================================================
   UNIVERSITY / COURSE MATCHING TYPES
========================================================= */

export type UniversityDifficulty = "Easy" | "Medium" | "Hard" | "Very Hard";

export type TuitionPeriod = "Year" | "Semester" | "Month";

export type LivingCostPeriod = "Month" | "Year";

export type MatchStatus =
  | "Matching"
  | "Review Required"
  | "Meets Published Requirements"
  | "Requirement Review Needed";

export type MatchAction = "Shortlist" | "Review" | "Verify";

/** Admission difficulty tier for one field of study (workbook Sheet1). */
export interface AdmissionDifficulty {
  field: string;
  level: string;
  markedPrivate?: boolean;
  sourceName?: string;
  sheet?: string;
  rowNumber?: number;
}

/** Original row from another workbook sheet, linked to a Sheet2 university. */
export interface LinkedSheetRow {
  sheet: string;
  rowNumber: number;
  sourceName: string;
  data: Record<string, string>;
}

export interface LivingBudget {
  min: number;
  max: number;
  currency: string;
  period: LivingCostPeriod;
  /** Where the figure comes from, e.g. the blocked account requirement. */
  source?: string;
}

export type AssessmentMatchStatus = "Meets Published Requirements" | "Requirement Review Needed";

export type AssessmentMatchAction = "Review credits" | "Shortlist" | "Verify";

export interface AssessmentMatch {
  university: string;
  course: string;
  status: AssessmentMatchStatus;
  issue: string;
  action: AssessmentMatchAction;
}

/* =========================================================
   STUDENT
========================================================= */

export interface Student {
  id: string;
  name: string;
  initials: string;
  email: string;
  mobile: string;

  qualification: string;
  branch: string;
  cgpa: string;
  graduationYear: number;

  desiredCourse: string;
  specialization: string;

  preferredCountries: string[];

  intake: string;

  budget: string;

  ielts?: string;
  german?: string;
  japanese?: string;

  counsellor: string;
  stage: StudentStage;
  lastFollowUp: string;
  status: RecordStatus;
  service: ServiceType;
  city: string;
}

/* =========================================================
   UNIVERSITY
========================================================= */

export interface University {
  id: string;
  name: string;
  country: string;
  city: string;
  state?: string;

  ranking?: string;
  difficulty?: "Easy" | "Medium" | "Hard" | "Very Hard";

  website?: string;
  portal?: string;

  applicationFee?: string;
  scholarship?: string;
  financialProof?: string;
  partTime?: string;
  postStudyWork?: string;

  documents?: string[];

  sop?: string;
  lor?: string;
  aps?: string;

  annualTuitionFee?: string;
  tuitionFeeMin?: number;
  tuitionFeeMax?: number;

  livingCostMin?: number;
  livingCostMax?: number;

  intake?: string[];

  applicationOpens?: string;
  applicationDeadline?: string;

  description?: string;
  requirements?: string[];

  englishRequirement?: string;

  popularCourses?: string[];

  recommendedIndianPercentage?: string;

  status?: string;
  lastVerified?: string;

  sourceUrl?: string;
  notes?: string;

  /** Original Germany workbook Sheet2 row, as stored by the seed script. */
  sheet2Data?: Sheet2Row;
  /** Later Sheet2 rows with the same university name. */
  sheet2DuplicateRows?: Sheet2Row[];

  rankingSource?: string;
  admissionDifficulty?: AdmissionDifficulty[];
  linkedSheetRows?: LinkedSheetRow[];

  /** Set when the record was created or last updated by an Excel import. */
  importSource?: {
    fileName: string;
    sheet: string;
    rowNumber: number | null;
    importId: string;
    importedAt: string;
  };
  /** Original uploaded row (header -> value). */
  sourceRow?: Record<string, string>;
  /** Non-template columns from the upload, preserved as-is. */
  extraFields?: Record<string, string>;
}

export interface Sheet2Row {
  University?: string;
  City?: string;
  "Annual Tuition Fee (EUR)"?: string;
  IELTS?: string | number;
  "Other Requirements"?: string;
  "Application Opens"?: string;
  "Application Deadline"?: string;
  "Major Courses"?: string;
  "Recommended Indian %"?: string;
}

/* =========================================================
   UNIVERSITY COURSE
========================================================= */

export interface UniversityCourse {
  /** Name of the linked university (from the populated reference). */
  universityName?: string;
  id: string;
  universityId: string;

  courseName: string;
  canonicalCourse?: string;
  aliases?: string[];

  degree?: string;
  specialization?: string;

  duration?: string;
  language?: string;

  tuitionMin?: number;
  tuitionMax?: number;
  tuitionCurrency?: string;
  tuitionPeriod?: TuitionPeriod;

  requiredDegree?: string;
  minimumGpa?: string;

  ielts?: string;
  toefl?: string;
  gre?: string;

  eligibility?: string;

  entranceExam?: string;
  interview?: string;

  difficulty?: UniversityDifficulty;

  intake?: string;

  applicationStartDate?: string;
  applicationDeadline?: string;

  lastVerified?: string;
  sourceUrl?: string;
  notes?: string;
}

/* =========================================================
   COUNTRY
========================================================= */

export interface Country {
  id: string;

  country: string;

  /*
   * Country-level living cost.
   */
  livingCostMin?: number;
  livingCostMax?: number;
  livingCostCurrency?: string;
  livingCostPeriod?: LivingCostPeriod;
  livingCostSource?: string;

  languageRequirements?: string;
  academicRequirements?: string;
  financialRequirements?: string;
  visaRequirements?: string;
  applicationProcess?: string;
  postStudy?: string;

  notes?: string;

  lastVerified?: string;
  sourceUrl?: string;

  /* Germany workbook, Sheets 5-12 */
  intakes?: CountryIntake[];
  admissionSteps?: { step: number; process: string }[];
  requiredDocuments?: CountryDocument[];
  universitySuggestionGuide?: Record<string, string>[];
  gradeConversion?: {
    universityType: string;
    typicalMinimumCgpa: string;
    germanGradeEquivalent: string;
  }[];
  referenceNotes?: { sheet: string; title: string; lines: string[] }[];
  unlinkedUniversityRows?: {
    sheet: string;
    rowNumber: number;
    name: string;
    reason: string;
    data: Record<string, string>;
  }[];
}

export interface CountryIntake {
  intake: string;
  classStart?: string;
  applicationStart?: string;
  applicationDeadline?: string;
}

export interface CountryDocument {
  document: string;
  purpose?: string;
  mandatory?: string;
}

export interface Course {
  id: string;
  name: string;
  degree: string;
  specialization: string;
  country: string;
  duration: string;
  language: string;
  requirements: string;
  notes: string;
  status: string;
}

/* =========================================================
   UNIVERSITY MATCH
========================================================= */

export interface UniversityMatch {
  universityId: string;
  university: string;

  country: string;
  city?: string;
  website?: string;

  /** Sheet2 "Major Courses" that matched the student's course/specialization. */
  matchedCourses: string[];
  /** All Sheet2 "Major Courses" for the university. */
  courses: string[];

  /** Raw Sheet2 "Annual Tuition Fee (EUR)" text. */
  annualTuitionFee?: string;
  tuitionMin?: number;
  tuitionMax?: number;
  /** Country-level living cost; not university-specific in the workbook. */
  livingBudget?: LivingBudget;

  ranking?: string;
  rankingSource?: string;
  admissionDifficulty: AdmissionDifficulty[];
  /** Fields from admissionDifficulty that match the student's course. */
  relevantDifficultyFields: string[];

  intakes: CountryIntake[];
  requiredDocuments: CountryDocument[];

  englishRequirement?: string;

  recommendedIndianPercentage?: string;

  applicationOpens?: string;
  applicationDeadline?: string;

  requirements: string[];

  matchedCriteria: string[];
  warnings: string[];
  missingRequirements: string[];

  status: MatchStatus;
  action: MatchAction;
}

/* =========================================================
   APPLICATION
========================================================= */

export interface Application {
  id: string;
  studentId: string;
  student: string;
  university: string;
  course: string;
  intake: string;
  status: KnownOr<ApplicationStatus>;
  deadline: string;
  submissionDate?: string;
  offerStatus: string;
  counsellor: string;
  notes: string;
}

export interface VisaCase {
  id: string;
  student: string;
  country: string;
  university: string;
  visaType: string;
  applicationDate: string;
  appointmentDate?: string;
  documentStatus: string;
  status: KnownOr<VisaStatus>;
  notes: string;
}

export interface DocumentRecord {
  id: string;
  student: string;
  studentId: string;
  type: string;
  status: KnownOr<DocumentStatus>;
  uploadedDate?: string;
  verifiedBy?: string;
  notes: string;
}

export interface Payment {
  id: string;
  student: string;
  service: KnownOr<ServiceType>;
  paymentType: string;
  amount: number;
  paidAmount: number;
  currency?: string;
  dueDate: string;
  paymentDate?: string;
  status: KnownOr<PaymentStatus>;
  method: string;
  notes: string;
}

export interface FollowUp {
  id: string;
  student: string;
  counsellor: string;
  type: string;
  date: string;
  time: string;
  priority: KnownOr<"High" | "Medium" | "Low">;
  status: KnownOr<FollowUpStatus>;
  notes: string;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  category: KnownOr<"Student" | "Applications" | "Visa" | "Payments" | "Documents">;
  time: string;
  tone: KnownOr<"info" | "warning" | "success">;
  read: boolean;
}

/* =========================================================
   DASHBOARD
========================================================= */

export interface DashboardData {
  stats: {
    label: string;
    value: string;
    detail: string;
    tone: "brand" | "warning" | "info" | "danger";
  }[];

  enquiryTrend: {
    label: string;
    height: string;
    count?: number;
  }[];

  pipeline: {
    label: string;
    count: number;
    state: "complete" | "active" | "upcoming";
  }[];

  countryMix: {
    country: string;
    count: number;
    width: string;
  }[];

  deadlines: {
    date: string;
    month: string;
    title: string;
    detail: string;
    tone: "danger" | "warning" | "info";
  }[];

  activities: {
    title: string;
    detail: string;
    tone: "success" | "brand" | "warning";
  }[];

  /** Figures for the Reports page. */
  reports: {
    activeStudents: number;
    services: number;
    applications: number;
    offers: number;
    outstanding: { currency: string; amount: number }[];
  };
}

/* =========================================================
   ASSESSMENT / MATCHING
========================================================= */

export interface AssessmentResult {
  summary: string;

  requirements: string[];

  issues: string[];

  missing: string[];

  countries: string[];

  courses: string[];

  matches: AssessmentMatch[];
}

/* =========================================================
   UNIVERSITY EXCEL IMPORT
========================================================= */

export type ExcelIssueSeverity = "ERROR" | "WARNING" | "INFO";

export interface ExcelImportIssue {
  severity: ExcelIssueSeverity;
  sheet: string;
  row: number | null;
  column: string;
  code: string;
  message: string;
  value: string;
  suggestion: string;
}

export type ExcelSheetType =
  | "universities"
  | "rankings"
  | "websites"
  | "admissionDifficulty"
  | "instructions"
  | "unrecognized"
  | "empty";

export interface ExcelColumnInfo {
  index: number;
  header: string;
  status: "mapped" | "suggested" | "unexpected" | "duplicate" | "empty";
  mappedTo?: string;
  mappedHeader?: string;
  suggestion?: string;
}

export type ExcelRowStatus =
  | "valid"
  | "invalid"
  | "duplicate"
  | "skipped"
  | "unlinked"
  | "ignored"
  | "header";

export interface ExcelSheetRow {
  rowNumber: number;
  cells: string[];
  status: ExcelRowStatus;
  action: string;
}

export interface ExcelSheetPreview {
  name: string;
  type: ExcelSheetType;
  purpose: string;
  headerRowNumber: number | null;
  rowCount: number;
  columnCount: number;
  columns: ExcelColumnInfo[];
  validRows: number;
  invalidRows: number;
  truncated: boolean;
  rows: ExcelSheetRow[];
}

export interface ExcelImportSummary {
  sheetsScanned: number;
  rowsScanned: number;
  totalColumns: number;
  validRows: number;
  invalidRows: number;
  skippedRows: number;
  duplicateRows: number;
  unlinkedRows: number;
  ignoredRows: number;
  universities: {
    new: number;
    alreadyExists: number;
    duplicateInFile: number;
    invalid: number;
    linkedExistingOnly: number;
  };
  willCreate: number;
  willUpdate: number;
  willSkip: number;
  errors: number;
  warnings: number;
  infos: number;
}

export type ExcelImportMode = "skip" | "update";

export interface ExcelPlannedUniversity {
  name: string;
  country: string;
  city: string;
  action: "create" | "update" | "skip";
  existingId?: string;
  sheet: string;
  rowNumber: number | null;
}

export interface ExcelImportPreview {
  fileName: string;
  fileSize: number;
  sha256: string;
  sheetCount: number;
  sheetNames: string[];
  options: { mode: ExcelImportMode; defaultCountry: string };
  canImport: boolean;
  importRowCount: number;
  summary: ExcelImportSummary;
  sheets: ExcelSheetPreview[];
  issues: ExcelImportIssue[];
  issuesTruncated: boolean;
  universities: ExcelPlannedUniversity[];
}

export interface ExcelImportOptions {
  mode: ExcelImportMode;
  defaultCountry: string;
}

export interface ExcelImportedUniversity {
  id: string;
  name: string;
  country: string;
  city: string;
  action: "created" | "updated";
}

export interface ExcelImportResult {
  importId: string;
  transactional: boolean;
  fileName: string;
  summary: {
    sheetsScanned: number;
    rowsScanned: number;
    imported: number;
    updated: number;
    skipped: number;
    duplicates: number;
    invalid: number;
    unlinked: number;
    errors: number;
    warnings: number;
  };
  universities: ExcelImportedUniversity[];
}
