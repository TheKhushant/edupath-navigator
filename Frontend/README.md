# EduPath Navigator

Build a complete, professional, responsive **SS Overseas CRM & Overseas Education Management System** as a frontend-first web application.

IMPORTANT:
This is NOT just a landing page or UI mockup.

Build it as a real working frontend application using **static/mock data for now**, but architect the entire frontend so that a Node.js + Express + MongoDB backend can be connected later with minimal changes.

The system is based on these core modules:

1. Student Enquiry CRM
2. Student Profile Assessment
3. University Database
4. Course Database
5. Country Requirements
6. Automatic University Matching
7. Application Tracker
8. Visa Tracker
9. Document Checklist
10. Payments
11. Follow-ups
12. Counsellor Dashboard
13. Four separate service pipelines
14. Notifications / reminders

==================================================
TECH STACK & ARCHITECTURE
=========================

Use:

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui or equivalent reusable UI components
* React Router
* Lucide React icons
* Proper TypeScript interfaces/types
* Reusable components
* Clean folder structure

Do NOT create one huge component.

Use a scalable structure similar to:

src/
components/
layout/
ui/
dashboard/
students/
universities/
applications/
visa/
payments/
documents/
followups/
assessment/
pipelines/

pages/
Dashboard/
Students/
StudentDetails/
ProfileAssessment/
Universities/
UniversityDetails/
Applications/
ApplicationDetails/
Visa/
Payments/
Documents/
FollowUps/
Pipelines/
Courses/
Countries/
Reports/
Settings/

data/
mockStudents.ts
mockUniversities.ts
mockCourses.ts
mockCountries.ts
mockApplications.ts
mockVisaCases.ts
mockPayments.ts
mockDocuments.ts
mockFollowUps.ts
mockNotifications.ts

types/
student.ts
university.ts
course.ts
country.ts
application.ts
visa.ts
payment.ts
document.ts
followup.ts
assessment.ts

services/
studentService.ts
universityService.ts
courseService.ts
applicationService.ts
visaService.ts
paymentService.ts
documentService.ts
followupService.ts
assessmentService.ts

hooks/
useStudents.ts
useUniversities.ts
useApplications.ts
etc.

lib/
api.ts
utils.ts

The important requirement is:

UI components must NOT directly depend on mock arrays.

Instead:

Component
↓
Hook
↓
Service
↓
Mock data for now
↓
REST API later

For example:

useStudents()
↓
studentService.getStudents()
↓
mockStudents.ts

Later:

useStudents()
↓
studentService.getStudents()
↓
GET /api/students

The UI should not need to be rewritten when the backend is connected.

==================================================
MOCK DATA ARCHITECTURE
======================

Use realistic static data.

Do NOT put mock data directly inside JSX components.

Create separate mock data files.

Use at least 10-15 realistic students.

Example:

Student ID:
SS-2026-0001

Name:
Rahul Sharma

Mobile:
+91 XXXXX XXXXX

Email:
[rahul@example.com](mailto:rahul@example.com)

Qualification:
B.Tech E&TC

CGPA:
8.2

Graduation Year:
2026

Desired Course:
MS

Specialization:
VLSI

Preferred Countries:
Japan, Taiwan

Intake:
April 2027

Budget:
₹15,00,000

IELTS:
7.0

Counsellor:
Manisha

Stage:
Profile Assessment

Create different students with different stages so dashboard statistics look realistic.

==================================================
GLOBAL LAYOUT
=============

Create a professional CRM dashboard layout.

Desktop:

Left sidebar
+
Top navbar
+
Main content area

Sidebar should contain:

Dashboard

CRM

* Students
* Enquiries
* Profile Assessment
* Follow-ups

Study Abroad

* Universities
* Courses
* Countries
* Applications
* Documents
* Visa

Services

* Study Abroad
* Germany Ausbildung
* Opportunity Card
* Language Training

Finance

* Payments
* Pending Payments

Reports

Settings

Add a collapse/expand sidebar option.

On mobile, convert sidebar into a responsive drawer.

==================================================
TOP NAVBAR
==========

Include:

* Search
* Notifications
* Current counsellor profile
* Profile dropdown
* Quick Add button

Quick Add should allow:

* New Student
* New Follow-up
* New Application
* Add University

==================================================
DASHBOARD
=========

Create a professional counsellor dashboard.

Show:

TODAY

New Enquiries
7

Profiles Requiring Review
4

Documents Pending
12

Applications Approaching Deadline
3

Offer Letters Received
2

Visa Cases
5

Payments Pending
4

Follow-ups Due Today
9

Use attractive statistic cards.

Also create:

* Enquiry trend chart
* Application status chart
* Country distribution
* Pipeline overview
* Upcoming deadlines
* Recent activities
* Today's follow-ups
* Pending documents
* Recent applications

Dashboard data must come from a centralized dashboard service/mock data source, NOT hardcoded directly inside the dashboard component.

==================================================
STUDENT CRM
===========

Create a Students page.

Features:

* Search students
* Filter by country
* Filter by stage
* Filter by counsellor
* Filter by intake
* Filter by service
* Sort
* Pagination UI
* Add student
* Edit student
* View student
* Delete/archive UI

Table columns:

Student ID
Name
Email
Mobile
Qualification
Desired Course
Country
Intake
Counsellor
Current Stage
Last Follow-up
Status
Actions

Use status badges.

==================================================
STUDENT DETAILS
===============

Create a detailed student profile page.

Header:

Student name
Student ID
Current stage
Counsellor
Quick actions

Use tabs:

Overview
Academic Profile
Course Preferences
Country Preferences
Profile Assessment
Universities
Applications
Documents
Payments
Visa
Follow-ups
Activity Timeline

Student overview should show:

Personal information
Academic information
Language information
Financial information
Course preferences
Destination preferences

==================================================
PROFILE ASSESSMENT
==================

Create a professional assessment page.

Sections:

Academic

* Degree
* Branch
* CGPA/Percentage
* Backlogs
* Graduation Year
* Gap

Course

* Desired Degree
* Specialization
* Previous Subjects
* Relevant Experience

Language

* IELTS
* TOEFL
* PTE
* German
* Japanese
* Other Language

Financial

* Tuition Budget
* Living Budget
* Total Budget
* Financial Proof Capability

Destination

* Germany
* Japan
* Taiwan
* Netherlands
* Italy
* UK
* Australia
* Canada
* USA
* Other

Show:

Profile Summary
Potential Requirements
Possible Issues
Missing Information
Potential Countries
Potential Courses
University Matching

IMPORTANT:

Do NOT show unsupported "admission probability" or fake percentage chances.

Use wording such as:

"Meets published requirements"
"Requirement Review Needed"
"Prerequisite Check"
"Additional Documentation Required"
"Counsellor Review Required"

The system should assist the counsellor, not make unsupported guarantees.

==================================================
UNIVERSITY DATABASE
===================

Create a complete University Management page.

Features:

* Search
* Country filter
* Course filter
* Language filter
* Intake filter
* Tuition range
* Last verified filter
* Add university
* Edit university
* View university

University fields:

University Name
Country
City
Course
Specialization
Language
Tuition
Intake
Application Deadline
Application Fee
Eligibility
Required Degree
Minimum GPA
IELTS
TOEFL
GRE
Entrance Examination
Interview
Living Cost
Scholarship
Financial Proof
Part-time Work Information
Post-study Work Information
Required Documents
SOP Requirement
LOR Requirement
APS
University Website
Application Portal
Last Verified Date
Source URL
Counsellor Notes

Show a warning if "Last Verified Date" is old.

==================================================
UNIVERSITY MATCHING
===================

Create a University Matching interface.

The matching flow should visually show:

Country
↓
Language
↓
Intake
↓
Degree
↓
Specialization
↓
Academic Eligibility
↓
Counsellor Review
↓
Final Shortlist

Display results in a table:

University
Course
Match Status
Issues
Requirements
Counsellor Action
Shortlist

Example statuses:

Meets Published Requirements
Entrance Exam Check
Prerequisite Review
Intake Unavailable
Language Requirement
Academic Requirement

Add:

"Shortlist" button.

The matching logic should be implemented in a separate service:

universityMatchingService.ts

Do NOT put matching logic directly inside the UI.

==================================================
APPLICATION TRACKER
===================

Create an Applications page.

Each student can have multiple university applications.

Fields:

Student
University
Course
Intake
Application Status
Application Deadline
Submission Date
Offer Status
Counsellor
Notes

Statuses:

Not Started
Draft
Documents Pending
Ready to Submit
Submitted
Under Review
Offer Received
Rejected
Withdrawn

Create an application details page with a timeline.

==================================================
APPLICATION PIPELINE
====================

Visualize:

Registration
↓
Profile Assessment
↓
University Shortlist
↓
Documents
↓
SOP
↓
LOR
↓
Application
↓
Offer Letter
↓
Financial Documents
↓
Visa
↓
Departure

Allow counsellor to see exactly where each student is.

==================================================
DOCUMENT MANAGEMENT
===================

Create Documents page.

Document types:

Passport
Photo
10th Marksheet
12th Marksheet
Degree Certificate
Semester Marksheet
Transcript
CV
SOP
LOR
IELTS Certificate
TOEFL Certificate
Financial Documents
Bank Statement
APS
Other

Statuses:

Pending
Uploaded
Under Review
Approved
Rejected

Each document should show:

Student
Document Type
Status
Uploaded Date
Verified By
Notes
Action

Add progress indicators such as:

Documents: 80%

==================================================
VISA TRACKER
============

Create Visa Management page.

Fields:

Student
Country
University
Visa Type
Application Date
Appointment Date
Document Status
Visa Status
Notes

Statuses:

Not Started
Documents Pending
Ready
Appointment Scheduled
Submitted
Under Review
Approved
Rejected

Show upcoming visa appointments.

==================================================
PAYMENTS
========

Create Payments page.

Track:

Student
Service
Payment Type
Amount
Paid Amount
Pending Amount
Due Date
Payment Date
Status
Payment Method
Notes

Statuses:

Paid
Partial
Pending
Overdue

Create summary cards:

Total Revenue
Collected
Pending
Overdue

==================================================
FOLLOW-UP MANAGEMENT
====================

Create Follow-ups page.

Fields:

Student
Counsellor
Follow-up Type
Date
Time
Priority
Status
Notes

Types:

Call
WhatsApp
Email
Meeting
Document Reminder
Payment Reminder
Application Follow-up

Statuses:

Pending
Completed
Overdue

Create:

Today's Follow-ups
Upcoming Follow-ups
Overdue Follow-ups

==================================================
NOTIFICATIONS
=============

Create a notification center.

Examples:

"Rahul Sharma has not submitted transcript."

"University A application deadline is approaching."

"Offer letter received for Rahul Sharma."

"Visa appointment is approaching."

"Payment due for student."

Notifications should come from mock notification data.

Create notification service separately.

==================================================
FOUR SERVICE PIPELINES
======================

Create a Pipelines section with four separate workflows.

1. STUDY ABROAD

Enquiry
→ Registration
→ Profile
→ Shortlist
→ Application
→ Offer
→ Visa
→ Departure

2. GERMANY AUSBILDUNG

Enquiry
→ Eligibility
→ German A1
→ A2
→ B1
→ Documents
→ Employer Applications
→ Contract
→ Visa

3. OPPORTUNITY CARD

Enquiry
→ Eligibility
→ Qualification
→ Points
→ Documents
→ Financial Proof
→ Application
→ Visa
→ Arrival

4. LANGUAGE TRAINING

Registration
→ A1
→ A2
→ B1
→ Goethe Preparation
→ Exam

Each pipeline should have its own Kanban-style interface.

==================================================
COURSES
=======

Create Courses management.

Fields:

Course Name
Degree
Specialization
Country
Duration
Language
Requirements
Notes
Status

==================================================
COUNTRIES
=========

Create Countries management.

Fields:

Country
Language Requirements
Academic Requirements
Financial Requirements
Visa Requirements
Application Process
Post-study Information
Notes
Last Verified Date
Source URL

==================================================
REPORTS
=======

Create a Reports dashboard.

Reports:

Student count
Country distribution
Applications by status
Offers received
Visa cases
Pending payments
Monthly enquiries
Conversion funnel
Counsellor workload

Use charts and tables.

==================================================
DESIGN SYSTEM
=============

Design should look like a modern professional SaaS CRM.

Style:

* Clean
* Premium
* Professional
* Minimal
* Corporate
* Easy to use
* Not overly colorful
* Excellent spacing
* Rounded cards
* Subtle shadows
* Clear typography
* Professional status badges
* Consistent icon system

Use a professional overseas education consultancy feel.

Do NOT make it look like a generic admin template.

Use a consistent visual hierarchy.

Important information should be easy to scan.

==================================================
RESPONSIVENESS
==============

The entire application must work on:

Desktop
Laptop
Tablet
Mobile

Tables should become responsive cards or horizontal scrolling on small screens.

Forms should stack properly on mobile.

Sidebar should become a mobile drawer.

==================================================
FORMS
=====

Every major module should have reusable forms.

Use proper validation UI.

Examples:

Add Student
Edit Student
Add University
Edit University
Add Course
Add Application
Add Payment
Add Follow-up

Use reusable form components wherever possible.

==================================================
BACKEND-READY REQUIREMENT
=========================

This is extremely important.

The frontend must be designed so that the backend can later be connected without rebuilding the UI.

Create service functions such as:

studentService.getStudents()
studentService.getStudentById(id)
studentService.createStudent(data)
studentService.updateStudent(id, data)
studentService.deleteStudent(id)

universityService.getUniversities()
universityService.getUniversityById(id)
universityService.createUniversity(data)
universityService.updateUniversity(id, data)

applicationService.getApplications()
applicationService.getApplicationById(id)
applicationService.createApplication(data)
applicationService.updateApplication(id, data)

paymentService.getPayments()
paymentService.createPayment(data)
paymentService.updatePayment(id, data)

documentService.getDocuments()
documentService.uploadDocument(data)
documentService.updateDocumentStatus(id, status)

followupService.getFollowUps()
followupService.createFollowUp(data)
followupService.updateFollowUp(id, data)

visaService.getVisaCases()
visaService.createVisaCase(data)
visaService.updateVisaCase(id, data)

assessmentService.assessStudent(data)

For now these services should use mock data.

Later these same functions should call REST APIs.

==================================================
API CONFIGURATION
=================

Create a centralized API configuration.

Example:



Create:

src/lib/api.ts

Do not hardcode API URLs throughout the application.

For now:

USE_MOCK_DATA=true

or an equivalent centralized configuration.

Later I should be able to switch:

USE_MOCK_DATA=false

and connect the services to the backend.

==================================================
STATE MANAGEMENT
================

Use a scalable state management approach.

Keep server/data fetching logic separate from UI state.

Do not create unnecessary global state.

Use React Query/TanStack Query if appropriate for data fetching architecture.

Even when using mock data, structure hooks as if they are consuming APIs.

==================================================
ERROR / LOADING / EMPTY STATES
==============================

Every major data page must support:

Loading state
Empty state
Error state
Success state

Create reusable components:

LoadingState
EmptyState
ErrorState
ConfirmDialog
StatusBadge
PageHeader
DataTable
SearchFilterBar
StatCard

==================================================
IMPORTANT DATA RULE
===================

Never hardcode data like:

const students = [...]

inside page components.

All data must come from:

mock data
→ service
→ hook
→ component

This is required so that the backend can be attached later with minimal frontend changes.

==================================================
ROUTING
=======

Create proper routes for all pages.

Example:

/dashboard
/students
/students/:id
/assessment
/universities
/universities/:id
/applications
/applications/:id
/documents
/visa
/payments
/followups
/pipelines
/courses
/countries
/reports
/settings

==================================================
DEMO EXPERIENCE
===============

Populate the application with realistic mock data.

The dashboard must look populated immediately after running the project.

Users should be able to:

* Search students
* Open student details
* Filter data
* Navigate between modules
* Open applications
* View documents
* View visa cases
* View payments
* View follow-ups
* View university information
* Perform profile assessment
* See university matching
* Move through pipeline stages
* Open forms
* See validation states

Buttons should actually work within the frontend using mock data/state.

Do not create dead buttons everywhere.

==================================================
FINAL REQUIREMENT
=================

Build this as a real frontend application, NOT as a static visual prototype.

Prioritize:

1. Clean architecture
2. Reusable components
3. Type safety
4. Separation of UI and data
5. Mock service layer
6. Backend-ready API architecture
7. Responsive design
8. Realistic CRM workflows
9. Maintainability
10. Easy future MERN backend integration

The final result should feel like a production-ready internal CRM for an overseas education consultancy, while currently running entirely on static/mock data.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/75c68667-a96e-45ac-89f9-08869f37690b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
