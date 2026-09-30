require("dotenv").config();

const mongoose = require("mongoose");

const Student = require("../src/models/Student");
const University = require("../src/models/University");
const UniversityCourse = require("../src/models/UniversityCourse");
const Course = require("../src/models/Course");
const Country = require("../src/models/Country");
const Application = require("../src/models/Application");
const Document = require("../src/models/Document");
const VisaCase = require("../src/models/VisaCase");
const Payment = require("../src/models/Payment");
const FollowUp = require("../src/models/FollowUp");
const Notification = require("../src/models/Notification");

const { testStudents } = require("./testData/students");

// ======================================================
// Fictional CRM test data.
//
// Every record uses a "-TEST-" id (SS-TEST-, APP-TEST-, UNI-TEST-, ...),
// test emails use example.com and test universities are named
// "TEST University ...". Real/imported universities are only *referenced*
// (a fictional student applying to them); they are never modified.
//
//   node scripts/seedTestData.js            create / update test data
//   node scripts/seedTestData.js --remove   delete only the test data
// ======================================================

const MONGO_URI = process.env.MONGO_URI;
const REMOVE = process.argv.includes("--remove");

const TEST_ID = /-TEST-/;

// ------------------------------------------------------
// Countries (only name/code: no living costs or requirements invented)
// ------------------------------------------------------

const testCountries = [
  { id: "CTY-TEST-CAN", name: "Canada", code: "CA", status: "Active" },
  { id: "CTY-TEST-GBR", name: "United Kingdom", code: "GB", status: "Active" },
  { id: "CTY-TEST-AUS", name: "Australia", code: "AU", status: "Active" },
  { id: "CTY-TEST-IRL", name: "Ireland", code: "IE", status: "Active" },
];

// ------------------------------------------------------
// Clearly fictional universities for non-Germany scenarios.
// Fields follow the Sheet2-based University shape used by the matcher.
// ------------------------------------------------------

const TEST_UNIVERSITY_NOTE = "Fictional test university created by scripts/seedTestData.js";

const testUniversities = [
  {
    id: "UNI-TEST-A",
    name: "TEST University A",
    country: "Ireland",
    city: "Test City A",
    annualTuitionFee: "12000-16000",
    tuitionFeeMin: 12000,
    tuitionFeeMax: 16000,
    englishRequirement: "6.5",
    requirements: ["Bachelor's degree in a related field", "Statement of purpose"],
    applicationOpens: "January",
    applicationDeadline: "June",
    popularCourses: ["Computer Science", "Data Science", "Business Analytics"],
    recommendedIndianPercentage: "65-75%+",
    status: "Active",
    notes: TEST_UNIVERSITY_NOTE,
  },
  {
    id: "UNI-TEST-B",
    name: "TEST University B",
    country: "Canada",
    city: "Test City B",
    annualTuitionFee: "18000-24000",
    tuitionFeeMin: 18000,
    tuitionFeeMax: 24000,
    englishRequirement: "7.0",
    requirements: ["Bachelor's degree in a related field", "Two letters of recommendation"],
    applicationOpens: "October",
    applicationDeadline: "February",
    popularCourses: ["Computer Science", "Artificial Intelligence", "Software Engineering"],
    recommendedIndianPercentage: "70-80%+",
    status: "Active",
    notes: TEST_UNIVERSITY_NOTE,
  },
  {
    id: "UNI-TEST-C",
    name: "TEST University C",
    country: "United Kingdom",
    city: "Test City C",
    annualTuitionFee: "15000-20000",
    tuitionFeeMin: 15000,
    tuitionFeeMax: 20000,
    englishRequirement: "6.5",
    requirements: ["Bachelor's degree", "Work experience for MBA"],
    applicationOpens: "September",
    applicationDeadline: "May",
    popularCourses: ["MBA", "Finance", "International Business", "Artificial Intelligence"],
    recommendedIndianPercentage: "60-70%+",
    status: "Active",
    notes: TEST_UNIVERSITY_NOTE,
  },
  {
    id: "UNI-TEST-D",
    name: "TEST University D",
    country: "Australia",
    city: "Test City D",
    annualTuitionFee: "20000-28000",
    tuitionFeeMin: 20000,
    tuitionFeeMax: 28000,
    englishRequirement: "7.5",
    requirements: ["Bachelor's degree in engineering or health sciences"],
    applicationOpens: "August",
    applicationDeadline: "November",
    popularCourses: ["Mechanical Engineering", "Civil Engineering", "Health Sciences"],
    recommendedIndianPercentage: "65-75%+",
    status: "Active",
    notes: TEST_UNIVERSITY_NOTE,
  },
];

// ------------------------------------------------------
// Course master records
// ------------------------------------------------------

const testCourses = [
  { id: "CRS-TEST-001", name: "MSc Computer Science", degree: "MSc", level: "Master", specialization: "Computer Science", field: "Computing", country: "Germany", duration: "2 years", language: "English", status: "Active" },
  { id: "CRS-TEST-002", name: "MSc Data Science", degree: "MSc", level: "Master", specialization: "Data Science", field: "Computing", country: "Ireland", duration: "1 year", language: "English", status: "Active" },
  { id: "CRS-TEST-003", name: "MSc Artificial Intelligence", degree: "MSc", level: "Master", specialization: "Artificial Intelligence", field: "Computing", country: "Canada", duration: "2 years", language: "English", status: "Active" },
  { id: "CRS-TEST-004", name: "MBA", degree: "MBA", level: "Master", specialization: "General Management", field: "Business", country: "United Kingdom", duration: "1 year", language: "English", status: "Active" },
  { id: "CRS-TEST-005", name: "MSc Finance", degree: "MSc", level: "Master", specialization: "Finance", field: "Business", country: "United Kingdom", duration: "1 year", language: "English", status: "Active" },
  { id: "CRS-TEST-006", name: "MSc Mechanical Engineering", degree: "MSc", level: "Master", specialization: "Mechanical Engineering", field: "Engineering", country: "Germany", duration: "2 years", language: "English", status: "Active" },
  { id: "CRS-TEST-007", name: "MSc Biotechnology", degree: "MSc", level: "Master", specialization: "Biotechnology", field: "Life Sciences", country: "Germany", duration: "2 years", language: "English", status: "Draft" },
  { id: "CRS-TEST-008", name: "MSc Health Sciences", degree: "MSc", level: "Master", specialization: "Health Sciences", field: "Health", country: "Australia", duration: "2 years", language: "English", status: "Draft" },
];

// ------------------------------------------------------
// University courses: on TEST universities only, so no programme details
// are invented for real universities.
// [id, universityId, courseId, courseName, tuitionMin, tuitionMax, ielts, minimumGpa, intake, deadline, difficulty]
// ------------------------------------------------------

const universityCourseRows = [
  ["UC-TEST-001", "UNI-TEST-A", "CRS-TEST-001", "MSc Computer Science", 14000, 16000, "6.5", "65%", "September 2027", "30 Jun 2027", "Medium"],
  ["UC-TEST-002", "UNI-TEST-A", "CRS-TEST-002", "MSc Data Science", 13000, 15000, "6.5", "65%", "September 2027", "30 Jun 2027", "Medium"],
  ["UC-TEST-003", "UNI-TEST-A", "CRS-TEST-002", "MSc Business Analytics", 12000, 14000, "6.5", "60%", "January 2027", "15 Nov 2026", "Easy"],
  ["UC-TEST-004", "UNI-TEST-B", "CRS-TEST-001", "MSc Computer Science", 20000, 24000, "7.0", "75%", "September 2027", "28 Feb 2027", "Hard"],
  ["UC-TEST-005", "UNI-TEST-B", "CRS-TEST-003", "MSc Artificial Intelligence", 22000, 24000, "7.0", "78%", "January 2027", "31 Oct 2026", "Very Hard"],
  ["UC-TEST-006", "UNI-TEST-B", "CRS-TEST-001", "MEng Software Engineering", 18000, 21000, "7.0", "70%", "September 2027", "28 Feb 2027", "Hard"],
  ["UC-TEST-007", "UNI-TEST-C", "CRS-TEST-004", "MBA", 18000, 20000, "6.5", "60%", "January 2027", "30 Nov 2026", "Medium"],
  ["UC-TEST-008", "UNI-TEST-C", "CRS-TEST-005", "MSc Finance", 15000, 17000, "6.5", "65%", "September 2027", "31 May 2027", "Medium"],
  ["UC-TEST-009", "UNI-TEST-C", "CRS-TEST-004", "MSc International Business", 15000, 16000, "6.5", "60%", "September 2027", "31 May 2027", "Easy"],
  ["UC-TEST-010", "UNI-TEST-C", "CRS-TEST-003", "MSc Artificial Intelligence", 17000, 20000, "7.0", "70%", "January 2027", "30 Nov 2026", "Hard"],
  ["UC-TEST-011", "UNI-TEST-D", "CRS-TEST-006", "MEng Mechanical Engineering", 24000, 28000, "7.5", "70%", "February 2027", "30 Nov 2026", "Hard"],
  ["UC-TEST-012", "UNI-TEST-D", "CRS-TEST-006", "MEng Civil Engineering", 22000, 26000, "7.5", "65%", "July 2027", "30 Apr 2027", "Medium"],
  ["UC-TEST-013", "UNI-TEST-D", "CRS-TEST-008", "MSc Health Sciences", 20000, 24000, "7.5", "65%", "February 2027", "30 Nov 2026", "Medium"],
  ["UC-TEST-014", "UNI-TEST-D", "CRS-TEST-008", "Master of Public Health", 21000, 25000, "7.5", "65%", "July 2027", "30 Apr 2027", "Medium"],
  ["UC-TEST-015", "UNI-TEST-A", "CRS-TEST-003", "MSc Artificial Intelligence", 15000, 16000, "6.5", "70%", "September 2027", "30 Jun 2027", "Medium"],
];

// ------------------------------------------------------
// Applications
// [id, studentId, universityId, courseId, courseName, intake, status, applicationDate, deadline, submissionDate, offerStatus, offerDate]
// Real universities (DEU-xxx) are referenced only by their existing ids.
// ------------------------------------------------------

const applicationRows = [
  ["APP-TEST-001", "SS-TEST-0001", "DEU-001", "CRS-TEST-001", "MSc Computer Science", "October 2026", "Offer Received", "12 Jun 2026", "15 Jul 2026", "02 Jul 2026", "Offer received", "10 Sep 2026"],
  ["APP-TEST-002", "SS-TEST-0001", "UNI-TEST-A", "CRS-TEST-001", "MSc Computer Science", "September 2027", "Draft", "20 Sep 2026", "30 Jun 2027", "", "Not applicable", ""],
  ["APP-TEST-003", "SS-TEST-0002", "UNI-TEST-A", "CRS-TEST-002", "MSc Data Science", "September 2027", "Documents Pending", "05 Sep 2026", "30 Jun 2027", "", "Awaiting decision", ""],
  ["APP-TEST-004", "SS-TEST-0003", "DEU-004", "CRS-TEST-006", "MSc Mechanical Engineering", "April 2027", "Ready to Submit", "01 Sep 2026", "15 Jan 2027", "", "Awaiting decision", ""],
  ["APP-TEST-005", "SS-TEST-0004", "DEU-002", "CRS-TEST-007", "MSc Biotechnology", "October 2026", "Rejected", "10 May 2026", "15 Jul 2026", "30 Jun 2026", "Rejected", ""],
  ["APP-TEST-006", "SS-TEST-0005", "UNI-TEST-C", "CRS-TEST-004", "MBA", "January 2027", "Submitted", "18 Aug 2026", "30 Nov 2026", "15 Sep 2026", "Awaiting decision", ""],
  ["APP-TEST-007", "SS-TEST-0005", "DEU-016", "CRS-TEST-004", "MBA", "April 2027", "Under Review", "25 Aug 2026", "15 Jan 2027", "20 Sep 2026", "Awaiting decision", ""],
  ["APP-TEST-008", "SS-TEST-0006", "DEU-012", "CRS-TEST-001", "MSc Physics", "October 2026", "Not Started", "28 Sep 2026", "15 Jul 2027", "", "Not applicable", ""],
  ["APP-TEST-009", "SS-TEST-0007", "DEU-004", "CRS-TEST-006", "MSc Electrical Engineering", "October 2026", "Withdrawn", "02 Apr 2026", "15 Jul 2026", "", "Withdrawn", ""],
  ["APP-TEST-010", "SS-TEST-0008", "UNI-TEST-B", "CRS-TEST-003", "MSc Artificial Intelligence", "January 2027", "Submitted", "01 Aug 2026", "31 Oct 2026", "20 Aug 2026", "Awaiting decision", ""],
  ["APP-TEST-011", "SS-TEST-0008", "DEU-001", "CRS-TEST-003", "MSc Artificial Intelligence", "October 2026", "Offer Received", "05 Jun 2026", "15 Jul 2026", "25 Jun 2026", "Offer received", "05 Sep 2026"],
  ["APP-TEST-012", "SS-TEST-0010", "DEU-038", "CRS-TEST-001", "MSc Cognitive Science", "April 2027", "Documents Pending", "15 Sep 2026", "15 Jan 2027", "", "Awaiting decision", ""],
  ["APP-TEST-013", "SS-TEST-0012", "UNI-TEST-D", "CRS-TEST-006", "MEng Civil Engineering", "July 2027", "Draft", "22 Sep 2026", "30 Apr 2027", "", "Not applicable", ""],
  ["APP-TEST-014", "SS-TEST-0014", "UNI-TEST-D", "CRS-TEST-008", "MSc Health Sciences", "February 2027", "Under Review", "10 Aug 2026", "30 Nov 2026", "01 Sep 2026", "Awaiting decision", ""],
  ["APP-TEST-015", "SS-TEST-0016", "UNI-TEST-A", "CRS-TEST-002", "MSc Business Analytics", "January 2027", "Ready to Submit", "12 Sep 2026", "15 Nov 2026", "", "Awaiting decision", ""],
  ["APP-TEST-016", "SS-TEST-0016", "DEU-002", "CRS-TEST-002", "MSc Data Science", "April 2027", "Documents Pending", "18 Sep 2026", "15 Jan 2027", "", "Awaiting decision", ""],
  ["APP-TEST-017", "SS-TEST-0018", "UNI-TEST-B", "CRS-TEST-003", "MSc Artificial Intelligence", "January 2027", "Offer Received", "15 Jul 2026", "31 Oct 2026", "01 Aug 2026", "Offer received", "20 Sep 2026"],
  ["APP-TEST-018", "SS-TEST-0018", "UNI-TEST-C", "CRS-TEST-003", "MSc Artificial Intelligence", "January 2027", "Submitted", "20 Jul 2026", "30 Nov 2026", "10 Aug 2026", "Awaiting decision", ""],
  ["APP-TEST-019", "SS-TEST-0011", "DEU-064", "CRS-TEST-001", "MSc Architecture", "October 2026", "Rejected", "15 May 2026", "15 Jul 2026", "01 Jul 2026", "Rejected", ""],
  ["APP-TEST-020", "SS-TEST-0017", "DEU-006", "CRS-TEST-001", "MSc Computer Science", "April 2027", "Draft", "29 Sep 2026", "15 Jan 2027", "", "Not applicable", ""],
];

// ------------------------------------------------------
// Documents
// [id, studentId, applicationId|null, type, status, uploadedDate, verifiedBy, expiryDate, notes]
// ------------------------------------------------------

const documentRows = [
  ["DOC-TEST-001", "SS-TEST-0001", "APP-TEST-001", "Passport", "Approved", "02 Jun 2026", "Manisha", "12 Mar 2032", ""],
  ["DOC-TEST-002", "SS-TEST-0001", "APP-TEST-001", "Degree Certificate", "Approved", "02 Jun 2026", "Manisha", "", ""],
  ["DOC-TEST-003", "SS-TEST-0001", "APP-TEST-001", "IELTS Scorecard", "Approved", "03 Jun 2026", "Manisha", "15 May 2027", ""],
  ["DOC-TEST-004", "SS-TEST-0001", "APP-TEST-001", "APS Certificate", "Approved", "10 Jun 2026", "Manisha", "", ""],
  ["DOC-TEST-005", "SS-TEST-0001", "APP-TEST-001", "Blocked Account Confirmation", "Under Review", "20 Sep 2026", "", "", "Awaiting bank confirmation letter"],
  ["DOC-TEST-006", "SS-TEST-0002", "APP-TEST-003", "Passport", "Uploaded", "06 Sep 2026", "", "04 Jan 2031", ""],
  ["DOC-TEST-007", "SS-TEST-0002", "APP-TEST-003", "Transcripts", "Pending", "", "", "", "Not uploaded yet"],
  ["DOC-TEST-008", "SS-TEST-0002", "APP-TEST-003", "Statement of Purpose", "Pending", "", "", "", "Draft under review with student"],
  ["DOC-TEST-009", "SS-TEST-0003", "APP-TEST-004", "Passport", "Approved", "02 Sep 2026", "Manisha", "22 Aug 2030", ""],
  ["DOC-TEST-010", "SS-TEST-0003", "APP-TEST-004", "IELTS Scorecard", "Rejected", "02 Sep 2026", "Manisha", "", "Score 6.0 below the 6.5 requirement; retake planned"],
  ["DOC-TEST-011", "SS-TEST-0003", "APP-TEST-004", "Letter of Recommendation", "Uploaded", "10 Sep 2026", "", "", ""],
  ["DOC-TEST-012", "SS-TEST-0004", "APP-TEST-005", "Transcripts", "Approved", "12 May 2026", "Priyanka", "", ""],
  ["DOC-TEST-013", "SS-TEST-0004", "APP-TEST-005", "Passport", "Rejected", "12 May 2026", "Priyanka", "30 Aug 2026", "Passport expired; renewal required"],
  ["DOC-TEST-014", "SS-TEST-0005", "APP-TEST-006", "CV", "Approved", "19 Aug 2026", "Ravi", "", ""],
  ["DOC-TEST-015", "SS-TEST-0005", "APP-TEST-006", "Work Experience Certificate", "Approved", "19 Aug 2026", "Ravi", "", ""],
  ["DOC-TEST-016", "SS-TEST-0005", "APP-TEST-007", "Statement of Purpose", "Under Review", "26 Aug 2026", "", "", ""],
  ["DOC-TEST-017", "SS-TEST-0006", "APP-TEST-008", "IELTS Scorecard", "Pending", "", "", "", "Test not taken yet"],
  ["DOC-TEST-018", "SS-TEST-0006", "APP-TEST-008", "Transcripts", "Uploaded", "28 Sep 2026", "", "", ""],
  ["DOC-TEST-019", "SS-TEST-0007", null, "Passport", "Approved", "01 Apr 2026", "Manisha", "10 Oct 2029", ""],
  ["DOC-TEST-020", "SS-TEST-0008", "APP-TEST-010", "Passport", "Approved", "02 Aug 2026", "Ravi", "18 Feb 2033", ""],
  ["DOC-TEST-021", "SS-TEST-0008", "APP-TEST-010", "Letter of Recommendation", "Approved", "02 Aug 2026", "Ravi", "", ""],
  ["DOC-TEST-022", "SS-TEST-0008", "APP-TEST-011", "Blocked Account Confirmation", "Pending", "", "", "", "Blocked account not opened yet"],
  ["DOC-TEST-023", "SS-TEST-0009", null, "Transcripts", "Uploaded", "16 Sep 2026", "", "", ""],
  ["DOC-TEST-024", "SS-TEST-0010", "APP-TEST-012", "Statement of Purpose", "Pending", "", "", "", ""],
  ["DOC-TEST-025", "SS-TEST-0010", "APP-TEST-012", "IELTS Scorecard", "Approved", "15 Sep 2026", "Manisha", "01 Jun 2028", ""],
  ["DOC-TEST-026", "SS-TEST-0012", "APP-TEST-013", "Transcripts", "Pending", "", "", "", ""],
  ["DOC-TEST-027", "SS-TEST-0013", null, "German A2 Certificate", "Uploaded", "23 Sep 2026", "", "", ""],
  ["DOC-TEST-028", "SS-TEST-0014", "APP-TEST-014", "Passport", "Approved", "11 Aug 2026", "Ravi", "05 May 2031", ""],
  ["DOC-TEST-029", "SS-TEST-0014", "APP-TEST-014", "Nursing Registration", "Under Review", "11 Aug 2026", "", "", ""],
  ["DOC-TEST-030", "SS-TEST-0016", "APP-TEST-015", "CV", "Approved", "13 Sep 2026", "Priyanka", "", ""],
  ["DOC-TEST-031", "SS-TEST-0016", "APP-TEST-016", "APS Certificate", "Pending", "", "", "", "APS appointment booked"],
  ["DOC-TEST-032", "SS-TEST-0017", "APP-TEST-020", "Transcripts", "Pending", "", "", "", "Academic score not recorded yet"],
  ["DOC-TEST-033", "SS-TEST-0018", "APP-TEST-017", "Passport", "Approved", "16 Jul 2026", "Manisha", "09 Nov 2034", ""],
  ["DOC-TEST-034", "SS-TEST-0018", "APP-TEST-017", "Offer Letter", "Approved", "21 Sep 2026", "Manisha", "", ""],
  ["DOC-TEST-035", "SS-TEST-0018", "APP-TEST-017", "Financial Statement", "Under Review", "25 Sep 2026", "", "", ""],
];

// ------------------------------------------------------
// Visa cases
// [id, studentId, applicationId, visaType, status, applicationDate, appointmentDate, biometricDate, decisionDate, expiryDate, documentStatus, notes]
// ------------------------------------------------------

const visaRows = [
  ["VISA-TEST-001", "SS-TEST-0001", "APP-TEST-001", "National D (Student)", "Appointment Scheduled", "15 Sep 2026", "14 Oct 2026", "", "", "", "Blocked account confirmation pending", "Appointment booked at VFS"],
  ["VISA-TEST-002", "SS-TEST-0008", "APP-TEST-011", "National D (Student)", "Documents Pending", "12 Sep 2026", "", "", "", "", "Blocked account pending", ""],
  ["VISA-TEST-003", "SS-TEST-0018", "APP-TEST-017", "Study Permit", "Submitted", "22 Sep 2026", "", "29 Sep 2026", "", "", "All documents submitted", "Biometrics completed"],
  ["VISA-TEST-004", "SS-TEST-0005", "APP-TEST-006", "Student Visa", "Not Started", "", "", "", "", "", "Awaiting offer", ""],
  ["VISA-TEST-005", "SS-TEST-0014", "APP-TEST-014", "Student Visa (Subclass 500)", "Ready", "20 Sep 2026", "", "", "", "", "Ready to lodge after offer", ""],
  ["VISA-TEST-006", "SS-TEST-0010", "APP-TEST-012", "National D (Student)", "Not Started", "", "", "", "", "", "Awaiting admission", ""],
  ["VISA-TEST-007", "SS-TEST-0004", "APP-TEST-005", "National D (Student)", "Rejected", "01 Jul 2026", "10 Jul 2026", "10 Jul 2026", "05 Aug 2026", "", "Passport expired at submission", "Reapply after passport renewal"],
  ["VISA-TEST-008", "SS-TEST-0003", "APP-TEST-004", "National D (Student)", "Documents Pending", "25 Sep 2026", "", "", "", "", "IELTS retake result pending", ""],
  ["VISA-TEST-009", "SS-TEST-0016", "APP-TEST-015", "Stamp 2 Student Visa", "Under Review", "10 Sep 2026", "05 Oct 2026", "05 Oct 2026", "", "", "Submitted", ""],
  ["VISA-TEST-010", "SS-TEST-0002", "APP-TEST-003", "Stamp 2 Student Visa", "Approved", "01 Aug 2026", "12 Aug 2026", "12 Aug 2026", "01 Sep 2026", "31 Aug 2027", "Complete", "Approved for pre-sessional course"],
];

// ------------------------------------------------------
// Payments (INR)
// [id, studentId, applicationId|null, service, paymentType, amount, paidAmount, status, method, paymentDate, dueDate, notes]
// ------------------------------------------------------

const paymentRows = [
  ["PAY-TEST-001", "SS-TEST-0001", null, "Study Abroad", "Registration fee", 25000, 25000, "Paid", "UPI", "05 Jun 2026", "05 Jun 2026", ""],
  ["PAY-TEST-002", "SS-TEST-0001", "APP-TEST-001", "Study Abroad", "Application processing fee", 15000, 15000, "Paid", "Bank transfer", "15 Jun 2026", "20 Jun 2026", ""],
  ["PAY-TEST-003", "SS-TEST-0001", "APP-TEST-001", "Study Abroad", "Visa assistance fee", 30000, 10000, "Partial", "UPI", "18 Sep 2026", "10 Oct 2026", "Balance due before appointment"],
  ["PAY-TEST-004", "SS-TEST-0002", "APP-TEST-003", "Study Abroad", "Application processing fee", 15000, 0, "Pending", "", "", "15 Oct 2026", ""],
  ["PAY-TEST-005", "SS-TEST-0003", null, "Study Abroad", "Registration fee", 25000, 25000, "Paid", "Card", "28 Aug 2026", "01 Sep 2026", ""],
  ["PAY-TEST-006", "SS-TEST-0004", "APP-TEST-005", "Study Abroad", "Application processing fee", 15000, 0, "Overdue", "", "", "15 Aug 2026", "Two reminders sent"],
  ["PAY-TEST-007", "SS-TEST-0005", "APP-TEST-006", "Study Abroad", "Application processing fee", 20000, 20000, "Paid", "Bank transfer", "20 Aug 2026", "25 Aug 2026", ""],
  ["PAY-TEST-008", "SS-TEST-0005", null, "Study Abroad", "Counselling package", 60000, 30000, "Partial", "Bank transfer", "01 Sep 2026", "30 Oct 2026", ""],
  ["PAY-TEST-009", "SS-TEST-0008", "APP-TEST-011", "Study Abroad", "Visa assistance fee", 30000, 0, "Pending", "", "", "20 Oct 2026", ""],
  ["PAY-TEST-010", "SS-TEST-0013", null, "Germany Ausbildung", "Language training fee", 18000, 0, "Overdue", "", "", "10 Sep 2026", ""],
  ["PAY-TEST-011", "SS-TEST-0014", "APP-TEST-014", "Study Abroad", "Application processing fee", 15000, 15000, "Paid", "UPI", "12 Aug 2026", "15 Aug 2026", ""],
  ["PAY-TEST-012", "SS-TEST-0016", "APP-TEST-015", "Study Abroad", "Application processing fee", 15000, 5000, "Partial", "UPI", "14 Sep 2026", "05 Oct 2026", ""],
  ["PAY-TEST-013", "SS-TEST-0018", "APP-TEST-017", "Study Abroad", "Visa assistance fee", 30000, 30000, "Paid", "Card", "21 Sep 2026", "25 Sep 2026", ""],
  ["PAY-TEST-014", "SS-TEST-0018", null, "Study Abroad", "Accommodation booking fee", 40000, 0, "Pending", "", "", "30 Nov 2026", ""],
];

// ------------------------------------------------------
// Follow-ups
// [id, studentId, title, type, date, time, priority, status, completedDate, notes]
// ------------------------------------------------------

const followUpRows = [
  ["FU-TEST-001", "SS-TEST-0001", "Visa appointment preparation", "Call", "08 Oct 2026", "11:00", "High", "Pending", "", "Mock interview and document checklist"],
  ["FU-TEST-002", "SS-TEST-0001", "Offer acceptance confirmation", "Meeting", "12 Sep 2026", "15:00", "Medium", "Completed", "12 Sep 2026", "Offer accepted"],
  ["FU-TEST-003", "SS-TEST-0002", "Collect transcripts", "WhatsApp", "03 Oct 2026", "10:30", "High", "Pending", "", ""],
  ["FU-TEST-004", "SS-TEST-0003", "IELTS retake plan", "Call", "25 Sep 2026", "12:00", "High", "Overdue", "", "Student did not answer"],
  ["FU-TEST-005", "SS-TEST-0004", "Passport renewal status", "Email", "15 Oct 2026", "09:30", "Medium", "Pending", "", ""],
  ["FU-TEST-006", "SS-TEST-0005", "MBA interview preparation", "Meeting", "10 Oct 2026", "16:00", "Medium", "Pending", "", ""],
  ["FU-TEST-007", "SS-TEST-0006", "Book IELTS test date", "Call", "20 Sep 2026", "11:30", "Low", "Completed", "21 Sep 2026", "Test booked for November"],
  ["FU-TEST-008", "SS-TEST-0007", "Discuss withdrawn application", "Call", "05 Oct 2026", "14:00", "Low", "Pending", "", ""],
  ["FU-TEST-009", "SS-TEST-0008", "Blocked account setup", "Meeting", "02 Oct 2026", "13:00", "High", "Pending", "", ""],
  ["FU-TEST-010", "SS-TEST-0009", "Country options review", "Call", "18 Sep 2026", "17:00", "Medium", "Overdue", "", "Singapore/Canada options"],
  ["FU-TEST-011", "SS-TEST-0010", "SOP review session", "Meeting", "07 Oct 2026", "10:00", "Medium", "Pending", "", ""],
  ["FU-TEST-012", "SS-TEST-0011", "Portfolio feedback", "Email", "10 Sep 2026", "12:00", "Low", "Completed", "11 Sep 2026", ""],
  ["FU-TEST-013", "SS-TEST-0012", "Intake options (February not available)", "Call", "04 Oct 2026", "15:30", "Medium", "Pending", "", ""],
  ["FU-TEST-014", "SS-TEST-0013", "Ausbildung pathway counselling", "Meeting", "09 Oct 2026", "11:00", "Medium", "Pending", "", ""],
  ["FU-TEST-015", "SS-TEST-0014", "Visa lodgement readiness", "WhatsApp", "01 Oct 2026", "09:00", "High", "Pending", "", ""],
  ["FU-TEST-016", "SS-TEST-0015", "Complete profile details", "Call", "22 Sep 2026", "16:30", "Medium", "Overdue", "", "Course and scores missing"],
  ["FU-TEST-017", "SS-TEST-0016", "APS certificate progress", "Email", "06 Oct 2026", "10:00", "Medium", "Pending", "", ""],
  ["FU-TEST-018", "SS-TEST-0017", "Collect academic transcripts", "Call", "30 Sep 2026", "18:00", "High", "Pending", "", ""],
];

// ------------------------------------------------------
// Notifications
// [id, title, description, category, tone, read, relatedEntity, relatedEntityId, time]
// ------------------------------------------------------

const notificationRows = [
  ["NTF-TEST-001", "Offer letter received", "TEST: Aarav Mehta received an offer from Technical University of Munich (TUM).", "Applications", "success", false, "Application", "APP-TEST-001", "20 Sep 2026"],
  ["NTF-TEST-002", "Visa appointment booked", "TEST: Aarav Mehta has a visa appointment on 14 Oct 2026.", "Visa", "info", false, "VisaCase", "VISA-TEST-001", "16 Sep 2026"],
  ["NTF-TEST-003", "Payment overdue", "TEST: Application processing fee overdue for Sneha Reddy.", "Payments", "warning", false, "Payment", "PAY-TEST-006", "16 Aug 2026"],
  ["NTF-TEST-004", "Document rejected", "TEST: Passport rejected for Sneha Reddy (expired).", "Documents", "warning", true, "Document", "DOC-TEST-013", "13 May 2026"],
  ["NTF-TEST-005", "Transcripts pending", "TEST: Diya Kulkarni has not uploaded transcripts.", "Documents", "warning", false, "Document", "DOC-TEST-007", "25 Sep 2026"],
  ["NTF-TEST-006", "Application submitted", "TEST: Kabir Singh's MBA application to TEST University C was submitted.", "Applications", "info", true, "Application", "APP-TEST-006", "15 Sep 2026"],
  ["NTF-TEST-007", "Offer letter received", "TEST: Mansi Kapoor received an offer from TEST University B.", "Applications", "success", false, "Application", "APP-TEST-017", "20 Sep 2026"],
  ["NTF-TEST-008", "Visa approved", "TEST: Diya Kulkarni's visa was approved.", "Visa", "success", true, "VisaCase", "VISA-TEST-010", "01 Sep 2026"],
  ["NTF-TEST-009", "Follow-up overdue", "TEST: IELTS retake call with Rohan Iyer is overdue.", "Student", "warning", false, "FollowUp", "FU-TEST-004", "26 Sep 2026"],
  ["NTF-TEST-010", "New enquiry", "TEST: Harsh Agarwal registered; profile incomplete.", "Student", "info", false, "Student", "SS-TEST-0015", "24 Sep 2026"],
  ["NTF-TEST-011", "Payment received", "TEST: Visa assistance fee paid by Mansi Kapoor.", "Payments", "success", true, "Payment", "PAY-TEST-013", "21 Sep 2026"],
  ["NTF-TEST-012", "Application rejected", "TEST: Siddharth Rao's application was rejected.", "Applications", "warning", true, "Application", "APP-TEST-019", "05 Aug 2026"],
];

// ======================================================
// HELPERS
// ======================================================

const counts = {};

/** Insert or update a record by its readable id; returns the saved document. */
async function upsert(Model, label, doc) {
  const existing = await Model.findOne({ id: doc.id }, { _id: 1 }).lean();

  const saved = await Model.findOneAndUpdate(
    { id: doc.id },
    { $set: doc },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  counts[label] = counts[label] ?? { created: 0, updated: 0 };
  counts[label][existing ? "updated" : "created"]++;

  return saved;
}

const optional = (value) => (value === "" || value === null ? undefined : value);

/** Drops undefined keys so optional fields are simply not set. */
const compact = (doc) =>
  Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined));

function required(map, key, label) {
  const value = map.get(key);
  if (!value) throw new Error(`${label} "${key}" does not exist in MongoDB`);
  return value;
}

// ======================================================
// SEED
// ======================================================

async function seed() {
  // ---------- Safety: test emails must not belong to real students ----------

  const clashes = await Student.find({
    email: { $in: testStudents.map((student) => student.email) },
    id: { $not: TEST_ID },
  }).lean();

  if (clashes.length) {
    throw new Error(`Test emails already used by non-test students: ${clashes.map((s) => s.email).join(", ")}`);
  }

  // ---------- Countries (skip names that already exist) ----------

  for (const country of testCountries) {
    const existing = await Country.findOne({ name: country.name, id: { $not: TEST_ID } }).lean();
    if (existing) {
      counts.Countries = counts.Countries ?? { created: 0, updated: 0 };
      counts.Countries.existing = (counts.Countries.existing ?? 0) + 1;
      continue;
    }
    await upsert(Country, "Countries", country);
  }

  // ---------- Students ----------

  const students = new Map();
  for (const student of testStudents) {
    students.set(student.id, await upsert(Student, "Students", student));
  }

  // ---------- Universities (TEST only) + existing real ones by id ----------

  const universities = new Map();
  for (const university of testUniversities) {
    universities.set(university.id, await upsert(University, "Universities (TEST)", university));
  }

  const realUniversityIds = [...new Set(applicationRows.map((row) => row[2]).filter((id) => !TEST_ID.test(id)))];
  const realUniversities = await University.find({ id: { $in: realUniversityIds } });
  realUniversities.forEach((university) => universities.set(university.id, university));

  // ---------- Courses ----------

  const courses = new Map();
  for (const course of testCourses) {
    courses.set(course.id, await upsert(Course, "Courses", course));
  }

  // ---------- University courses ----------

  for (const [id, universityId, courseId, courseName, tuitionMin, tuitionMax, ielts, minimumGpa, intake, deadline, difficulty] of universityCourseRows) {
    const university = required(universities, universityId, "University");
    const course = required(courses, courseId, "Course");

    await upsert(UniversityCourse, "University Courses", {
      id,
      universityId: university._id,
      universityExternalId: university.id,
      universityName: university.name,
      courseId: course._id,
      courseExternalId: course.id,
      courseName,
      canonicalCourse: course.name,
      degree: course.degree,
      degreeLevel: course.level,
      specialization: course.specialization,
      duration: course.duration,
      language: course.language,
      tuitionMin,
      tuitionMax,
      tuitionFee: `${tuitionMin}-${tuitionMax}`,
      tuitionCurrency: "EUR",
      tuitionPeriod: "Year",
      intake,
      applicationDeadline: deadline,
      ielts,
      minimumGpa,
      requiredDegree: "Bachelor's degree in a related field",
      eligibility: `IELTS ${ielts}+ and ${minimumGpa} academic score`,
      difficulty,
      status: "Active",
      notes: "Fictional course on a TEST university",
    });
  }

  // ---------- Applications ----------

  const applications = new Map();
  for (const [id, studentId, universityId, courseId, courseName, intake, status, applicationDate, deadline, submissionDate, offerStatus, offerDate] of applicationRows) {
    const student = required(students, studentId, "Student");
    const university = required(universities, universityId, "University");
    const course = required(courses, courseId, "Course");

    applications.set(
      id,
      await upsert(Application, "Applications", compact({
        id,
        studentId: student._id,
        studentExternalId: student.id,
        studentName: student.name,
        universityId: university._id,
        universityExternalId: university.id,
        universityName: university.name,
        courseId: course._id,
        courseExternalId: course.id,
        courseName,
        intake,
        status,
        applicationDate,
        deadline,
        submissionDate: optional(submissionDate),
        submittedDate: optional(submissionDate),
        offerStatus,
        offerDate: optional(offerDate),
        applicationNumber: id.replace("APP-TEST-", "TEST-APPNO-"),
        counsellor: student.counsellor,
        notes: "Test application",
      })),
    );
  }

  // ---------- Documents ----------

  for (const [id, studentId, applicationId, type, status, uploadedDate, verifiedBy, expiryDate, notes] of documentRows) {
    const student = required(students, studentId, "Student");
    const application = applicationId ? required(applications, applicationId, "Application") : undefined;

    await upsert(Document, "Documents", compact({
      id,
      studentId: student._id,
      studentExternalId: student.id,
      studentName: student.name,
      applicationId: application?._id,
      applicationExternalId: application?.id,
      name: `${type} - ${student.name}`,
      type,
      status,
      fileName: uploadedDate ? `${id.toLowerCase()}.pdf` : undefined,
      uploadedDate: optional(uploadedDate),
      verifiedBy: optional(verifiedBy),
      verifiedAt: verifiedBy ? optional(uploadedDate) : undefined,
      expiryDate: optional(expiryDate),
      notes: optional(notes),
    }));
  }

  // ---------- Visa cases ----------

  for (const [id, studentId, applicationId, visaType, status, applicationDate, appointmentDate, biometricDate, decisionDate, expiryDate, documentStatus, notes] of visaRows) {
    const student = required(students, studentId, "Student");
    const application = required(applications, applicationId, "Application");
    const university = universities.get(application.universityExternalId);

    await upsert(VisaCase, "Visa Cases", compact({
      id,
      studentId: student._id,
      studentExternalId: student.id,
      studentName: student.name,
      applicationId: application._id,
      applicationExternalId: application.id,
      country: university?.country,
      university: application.universityName,
      visaType,
      status,
      applicationDate: optional(applicationDate),
      appointmentDate: optional(appointmentDate),
      biometricDate: optional(biometricDate),
      decisionDate: optional(decisionDate),
      expiryDate: optional(expiryDate),
      documentStatus,
      notes: optional(notes),
    }));
  }

  // ---------- Payments ----------

  for (const [id, studentId, applicationId, service, paymentType, amount, paidAmount, status, method, paymentDate, dueDate, notes] of paymentRows) {
    const student = required(students, studentId, "Student");
    const application = applicationId ? required(applications, applicationId, "Application") : undefined;

    await upsert(Payment, "Payments", compact({
      id,
      studentId: student._id,
      studentExternalId: student.id,
      studentName: student.name,
      applicationId: application?._id,
      applicationExternalId: application?.id,
      service,
      paymentType,
      amount,
      paidAmount,
      currency: "INR",
      status,
      method: optional(method),
      paymentMethod: optional(method),
      transactionId: paidAmount > 0 ? id.replace("PAY-TEST-", "TEST-TXN-") : undefined,
      paymentDate: optional(paymentDate),
      dueDate,
      notes: optional(notes),
    }));
  }

  // ---------- Follow-ups ----------

  for (const [id, studentId, title, type, date, time, priority, status, completedDate, notes] of followUpRows) {
    const student = required(students, studentId, "Student");

    await upsert(FollowUp, "Follow Ups", compact({
      id,
      studentId: student._id,
      studentExternalId: student.id,
      studentName: student.name,
      counsellor: student.counsellor,
      assignedTo: student.counsellor,
      title,
      type,
      date,
      dueDate: date,
      time,
      priority,
      status,
      completedDate: optional(completedDate),
      notes: optional(notes),
    }));
  }

  // ---------- Notifications ----------

  for (const [id, title, description, category, tone, read, relatedEntity, relatedEntityId, time] of notificationRows) {
    await upsert(Notification, "Notifications", {
      id,
      title,
      description,
      category,
      type: category,
      tone,
      read,
      priority: tone === "warning" ? "High" : "Normal",
      relatedEntity,
      relatedEntityId,
      time,
      createdAtSource: time,
    });
  }
}

// ======================================================
// VERIFY: every reference on test records points to a real document
// ======================================================

async function verify() {
  const checks = [
    [Application, "studentId", Student],
    [Application, "universityId", University],
    [Application, "courseId", Course],
    [UniversityCourse, "universityId", University],
    [UniversityCourse, "courseId", Course],
    [Document, "studentId", Student],
    [Document, "applicationId", Application],
    [VisaCase, "studentId", Student],
    [VisaCase, "applicationId", Application],
    [Payment, "studentId", Student],
    [Payment, "applicationId", Application],
    [FollowUp, "studentId", Student],
  ];

  let broken = 0;

  for (const [Model, field, Target] of checks) {
    const refs = await Model.distinct(field, { id: TEST_ID, [field]: { $ne: null } });
    const found = await Target.countDocuments({ _id: { $in: refs } });
    const ok = found === refs.length;
    if (!ok) broken += refs.length - found;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${Model.modelName}.${field} -> ${Target.modelName}: ${found}/${refs.length}`);
  }

  // Notifications reference by readable id (the schema has no ObjectId ref)
  const entityModels = { Application, VisaCase, Payment, Document, FollowUp, Student };
  const notifications = await Notification.find({ id: TEST_ID }, { relatedEntity: 1, relatedEntityId: 1 }).lean();
  let notificationRefs = 0;
  for (const notification of notifications) {
    const Model = entityModels[notification.relatedEntity];
    if (Model && (await Model.exists({ id: notification.relatedEntityId }))) notificationRefs++;
  }
  const notificationsOk = notificationRefs === notifications.length;
  if (!notificationsOk) broken += notifications.length - notificationRefs;
  console.log(`  ${notificationsOk ? "OK  " : "FAIL"} Notification.relatedEntityId -> related record: ${notificationRefs}/${notifications.length}`);

  return broken;
}

// ======================================================
// REMOVE: only records with a "-TEST-" id
// ======================================================

async function remove() {
  const models = [Notification, FollowUp, Payment, VisaCase, Document, Application, UniversityCourse, Course, University, Country, Student];

  for (const Model of models) {
    const result = await Model.deleteMany({ id: TEST_ID });
    console.log(`${Model.modelName} test records removed: ${result.deletedCount}`);
  }
}

async function main() {
  try {
    if (!MONGO_URI) throw new Error("MONGO_URI is missing in .env");

    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected.");
    console.log("");

    if (REMOVE) {
      await remove();
      return;
    }

    await seed();

    console.log("Test data summary");
    console.log("======================================");
    for (const [label, { created, updated, existing }] of Object.entries(counts)) {
      console.log(
        `${label.padEnd(22)} created: ${String(created).padStart(2)}  updated: ${String(updated).padStart(2)}${existing ? `  already existed (skipped): ${existing}` : ""}`,
      );
    }

    console.log("");
    console.log("Reference check");
    const broken = await verify();
    console.log(broken === 0 ? "All references point to existing documents." : `${broken} broken reference(s)!`);
    if (broken) process.exitCode = 1;
  } catch (error) {
    console.error("TEST DATA SEED ERROR:", error);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("MongoDB connection closed.");
    }
  }
}

main();
