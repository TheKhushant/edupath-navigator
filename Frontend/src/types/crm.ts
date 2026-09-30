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
  "Matching" | "Review Required" | "Meets Published Requirements" | "Requirement Review Needed";

export type MatchAction = "Shortlist" | "Review" | "Review credits" | "Verify";

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
}

/* =========================================================
   UNIVERSITY COURSE
========================================================= */

export interface UniversityCourse {
  id: string;
  universityId: string;

  courseName: string;
  canonicalCourse: string;
  aliases: string[];

  degree: string;
  specialization: string;

  duration: string;
  language: string;

  tuitionMin: number;
  tuitionMax: number;
  tuitionCurrency: string;
  tuitionPeriod: TuitionPeriod;

  requiredDegree: string;
  minimumGpa: string;

  ielts?: string;
  toefl?: string;
  gre?: string;

  eligibility: string;

  entranceExam: string;
  interview: string;

  difficulty: UniversityDifficulty;

  intake: string;

  applicationStartDate: string;
  applicationDeadline: string;

  lastVerified: string;
  sourceUrl: string;
  notes: string;
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
  livingCostMin: number;
  livingCostMax: number;
  livingCostCurrency: string;
  livingCostPeriod: LivingCostPeriod;

  languageRequirements: string;
  academicRequirements: string;
  financialRequirements: string;
  visaRequirements: string;
  applicationProcess: string;
  postStudy: string;

  notes: string;

  lastVerified: string;
  sourceUrl: string;
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

  countryId: string;
  country: string;

  courseId: string;
  course: string;
  canonicalCourse: string;

  difficulty: UniversityDifficulty;

  tuitionMin: number;
  tuitionMax: number;
  tuitionCurrency: string;
  tuitionPeriod: TuitionPeriod;

  livingCostMin: number;
  livingCostMax: number;
  livingCostCurrency: string;
  livingCostPeriod: string;

  intake: string;
  applicationStartDate: string;
  applicationDeadline: string;

  lastVerified: string;

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
  status: ApplicationStatus;
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
  status: VisaStatus;
  notes: string;
}

export interface DocumentRecord {
  id: string;
  student: string;
  studentId: string;
  type: string;
  status: DocumentStatus;
  uploadedDate?: string;
  verifiedBy?: string;
  notes: string;
}

export interface Payment {
  id: string;
  student: string;
  service: ServiceType;
  paymentType: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paymentDate?: string;
  status: PaymentStatus;
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
  priority: "High" | "Medium" | "Low";
  status: FollowUpStatus;
  notes: string;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  category: "Student" | "Applications" | "Visa" | "Payments" | "Documents";
  time: string;
  tone: "info" | "warning" | "success";
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
