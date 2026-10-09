# EduPath Navigator: Project Summary

## What it is
EduPath Navigator (branded in the UI as the **"SS Overseas CRM"**) is a full-stack **CRM for a study-abroad consultancy**. Counsellors use it to manage students who want to study abroad, mainly in **Germany**, from first enquiry through university matching, applications, documents, visa and payments.

The repo has two independent apps:
- `Frontend/`: React 19 + TanStack Start SSR app (first scaffolded with Lovable)
- `Backend/`: Node.js + Express 5 + MongoDB (Mongoose) REST API

Deployment: frontend on **Vercel** (`edupath-navigator-*.vercel.app`), backend on **Render** (`edupath-navigator2.onrender.com/api`).

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend framework | React 19, TanStack Start (SSR), TanStack Router (file-based routes), TanStack Query |
| Build | Vite 8, Nitro, TypeScript 5 |
| UI | Tailwind CSS v4, shadcn/ui (Radix UI primitives), lucide-react icons, Recharts, sonner toasts |
| Forms / validation | react-hook-form, zod |
| Backend | Node.js (CommonJS), Express 5, Mongoose 9, dotenv, cors |
| Data import | `xlsx` (SheetJS) for Excel/CSV parsing |
| Database | MongoDB |
| Tests | Node built-in test runner (`node --test`) |

---

## Folder structure

```
Backend/
  server.js                  # entry: loads env, connects DB, starts Express
  src/app.js                 # Express app, CORS, mounts all /api routes
  src/config/db.js           # Mongoose connection (MONGO_URI)
  src/models/                # Mongoose schemas (see below)
  src/controllers/           # CRUD logic per resource + dashboard + Excel import
  src/routes/                # Express routers
  src/services/universityExcelImport.js   # Excel upload → preview → confirm import
  src/utils/universityNameMatching.js     # fuzzy university-name normalization/matching
  src/utils/idFilter.js      # lookup by custom `id` string or Mongo _id
  scripts/                   # seed scripts + Hochschulkompass importer
  data/                      # Germany(1).xlsx source data, CSV template, alias JSON
  tests/                     # hochschulkompassImport.test.js

Frontend/
  src/routes/                # pages: index (dashboard), students, universities, courses,
                             # applications, documents, visa, payments, follow-ups,
                             # pipelines, assessment, university-matcher, reports, settings
  src/components/crm/        # CrmWorkspace.tsx (app shell + module views),
                             # UniversityMatcher, UniversityMatchCard, UniversityImport
  src/components/ui/         # shadcn/ui components
  src/services/crmServices.ts       # API calls per resource (or mock data)
  src/services/universityMatcher.ts # client-side student → university matching engine
  src/services/studentAssessment.ts # builds a profile assessment from matches + documents
  src/hooks/useCrm.ts        # data-fetching hooks
  src/lib/api.ts             # fetch wrapper, base URL, mock-data toggle
  src/types/crm.ts           # shared TypeScript types
  src/data/mockData.ts       # mock dataset used when VITE_USE_MOCK_DATA=true
```

---

## Data models (MongoDB / Mongoose)
Every model has an optional custom string `id` (unique, sparse) next to Mongo's `_id`. Relations are stored both as an ObjectId ref and as a denormalized external id + name (for example `studentId`, `studentExternalId`, `studentName`).

- **Student**: name, email, mobile, qualification, branch, cgpa, graduationYear, desiredCourse, specialization, preferredCountries[], intake, budget, IELTS, counsellor, status/stage, etc.
- **University**: name, country, city, state, ranking, difficulty (Easy/Medium/Hard/Very Hard), website, portal, applicationFee, scholarship, financialProof, partTime work info, tuition range, IELTS and academic % requirements, courses.
- **UniversityCourse**: a programme at a university: universityId/name, courseId/name, canonicalCourse, aliases[], degree, degreeLevel, specialization, duration, language, plus newer fields for Hochschulkompass imports (source, source ids, etc.).
- **Course**: generic course catalogue: name, degree, level, specialization, country, duration, language, requirements, field, status.
- **Country**: name, code, living cost (min/max/currency/period/source), intakes[] (intake, class start, application window, deadline), admissionSteps[], requiredDocuments[].
- **Application**: student, university, course, intake, status, applicationDate, etc.
- **Document**: student/application, name, type, status (Pending/Verified/Rejected…), fileName, fileUrl, upload date.
- **VisaCase**: student/application, country, university, visaType, status, application/appointment/biometric dates.
- **Payment**: student/application, service, paymentType, amount, paidAmount, currency (default INR), status, method.
- **FollowUp**: student, counsellor, title, description, type, date/time/dueDate, priority, status.
- **Notification**: title, description/message, category, tone, read, priority, relatedEntity/id.
- **ExcelImport**: audit log of each university Excel import (summary, sheets, issues, preserved rows, created/updated university IDs).

---

## REST API (base: `/api`)
Every resource has standard CRUD: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`.

- `/students`, `/universities`, `/university-courses`, `/courses`, `/countries`
- `/applications`, `/documents`, `/visa-cases`, `/payments`, `/follow-ups`, `/notifications`
- `GET /courses` and `GET /university-courses` also accept `?q=` (ranked tag search), `?page=&limit=` and exact filters (e.g. `status`, `country`, `degree`, `city`, `source`). Without these parameters they return every record, as before.
- `/search-tags`: CRUD for the tag dictionary. Editing a name, alias or status re-tags all courses. `GET /search-tags/expand?q=` previews how a term expands, and `GET /search-tags/analytics?scope=courses` returns the top searches and searches that found nothing.
- `/explorer` (read-only):
  - `GET /explorer/universities` and `GET /explorer/courses`: search with filters, sort and paging.
  - `GET /explorer/facets`: the values available for each filter.
  - `GET /explorer/universities/:id` and `GET /explorer/courses/:id`: details.
  - `GET /explorer/items?universities=&courses=`: several records in one call, for compare and presentation.
- `GET /dashboard`: aggregated metrics, pipeline stages, queues, reports data
- `GET /health`: health check
- University Excel import:
  - `GET /universities/import/template`: download Excel template
  - `POST /universities/import/preview`: upload a file and get a dry-run preview with row issues
  - `POST /universities/import/confirm`: apply the import

No authentication or authorization yet. CORS allows localhost:5173/8080, the two Vercel domains and `FRONTEND_URL`.

---

## Key features

1. **Dashboard / Overview**: KPI stat cards, charts (Recharts), pipeline stage counts, recent records, queues.
2. **CRM modules**: list, filter, detail and create/edit views for Students, Universities, Courses, Applications, Documents, Visa cases, Payments and Follow-ups, all inside one shared shell (`CrmWorkspace.tsx`) with sidebar navigation, notifications and quick-add.
3. **University Matcher** (`universityMatcher.ts`, runs on the client): takes a student profile and compares it with every university on:
   - preferred country and desired course/specialization (normalized text, abbreviation expansion such as AI → Artificial Intelligence)
   - IELTS vs required IELTS
   - academic % (CGPA parsing) vs recommended Indian percentage
   - budget (EUR) vs tuition range: Within / Near / Above Budget
   - intake months, country living cost, required documents
   - Each match comes out as one of: **Meets Published Requirements → Shortlist**, **Matching → Verify**, **Requirement Review Needed → Review**, **Review Required → Review**, with matchedCriteria / warnings / missingRequirements lists. It only uses real data and never invents placeholder values.
4. **Assessment** (`studentAssessment.ts`): profile assessment built from the matcher results (top 3) and the student's open documents (Pending/Rejected).
5. **Pipelines & Reports**: stage-wise student pipeline and reporting views.
6. **University Excel import** (backend service + `UniversityImport.tsx`): upload `.xlsx/.xls` (max 5 MB, 30 sheets, 5000 rows/sheet), fuzzy-match university names (including swapped word order), preview the issues, then confirm. Each import is logged in `ExcelImport`.
7. **Mock-data mode**: with `VITE_USE_MOCK_DATA=true` the frontend runs fully on `mockData.ts` without the backend.
8. **Course search with related search tags**: the Courses page has two tabs, the course catalogue (`Course`) and university programmes (`UniversityCourse`, including Hochschulkompass imports). Both are searched, filtered and paginated on the server.
   - A shared `SearchTag` dictionary (collection `searchtags`) stores concepts, their aliases (synonyms) and links to other concepts as `closely_related` or `broader_related`. For example, AI → aliases (AI, KI, …), closely related (Machine Learning, Deep Learning, Generative AI, …), broader (Data Science).
   - Each course stores only `searchTags`, the concept keys detected in its own name and specialization, plus any `customSearchTags` an admin adds. A Mongoose plugin keeps these fields current on create, save, insertMany and update, so imported courses are tagged automatically.
   - The search follows relations one level deep and ranks results: exact name > specialization > tag > closely related > broader > plain text. It handles case, punctuation and German spellings, corrects small typos ("Artifical Intelligence"), and offers "Did you mean" suggestions when nothing matches.
   - The UI shows which related tags were used and why each course matched. It also has a Search tags manager and a list of searches that found nothing (stored in `searchlogs`).
   - Universities are searchable by the same tags, derived from their name and `popularCourses`. The University programmes tab in Courses can add and edit programmes, including university, fees, intake, deadline, requirements, application method, course URL and custom tags.
9. **University & Course Explorer** (`/explorer`, sidebar "Explorer"): a counsellor page with two modes, Universities and Courses.
   - Search, sorting (best match, name, ranking, tuition, recently added) and pagination run on the server.
   - Data-driven filters cover country, state, city, university type, degree, subject, specialization, language, intake, study mode, duration, tuition, application method, deadline month, maximum IELTS and a requirement keyword. A filter only appears when the data has values for it.
   - Every filter and search lives in URL query parameters. Results can be shown as a grid or list. A details side panel covers the university with its programmes and country admission info, or the programme with its university.
   - Counsellor tools: a ⭐ shortlist kept in the browser, Compare (up to 4 side by side), and Present (`/explorer/present?universities=…&courses=…&student=…`), a clean printable page for students with a shareable link.

---

## Data scripts (Backend)
- `npm run seed`: `scripts/seed.js` (run via tsx), seeds DB from `seedData.js`
- `seedGermany.js`: seeds German universities/countries from `data/Germany(1).xlsx`
- `seedTestData.js`, `seedTestStudents.js`: test data
- `npm run seed:search-tags`: `scripts/seedSearchTags.js`. It adds the starter vocabulary from `data/search-tags.json` (35 concepts, including German terms) and re-tags every course, which also backfills old records. It is safe to re-run because it only adds missing tags and never overwrites admin edits. It also supports `--dry-run` and `--retag-only`.
- `npm run import:hochschulkompass` (**work in progress, uncommitted**): `scripts/importHochschulkompass.js` imports German degree programmes from a Hochschulkompass (HRK) JSON/CSV/XLSX export as `UniversityCourse` documents. It is **additive only** (it only uses `create()` and never updates or deletes), supports `--dry-run`, `--limit=N`, `--file`, `--report`, `--normalized` and `--create-universities`, uses a university alias file for name matching, and writes a JSON report. It has tests in `tests/hochschulkompassImport.test.js` (`npm test`).

---

## Running locally
```
# Backend
cd Backend
cp .env.example .env     # PORT=5000, MONGO_URI=mongodb://127.0.0.1:27017/edupath_navigator, FRONTEND_URL=http://localhost:5173
npm install
npm run dev              # nodemon server.js
npm run seed             # optional

# Frontend
cd Frontend
npm install
# .env: VITE_API_BASE_URL=http://localhost:5000/api, VITE_USE_MOCK_DATA=false
npm run dev
```

---

## Current state and known gaps
- Main CRUD + dashboard + matcher + Excel import are implemented and deployed.
- In progress (uncommitted): Hochschulkompass programme import, extra fields on `University` / `UniversityCourse`, updates to `universityCourseController` and `types/crm.ts`.
- Not yet done: authentication/roles (the search tag admin endpoints are open, like every other endpoint), real file upload storage for documents (only `fileUrl` is stored), pagination on the other modules. Tests cover the importer and course search (`npm test`; the integration tests need a local `MONGO_TEST_URI`).
- Dates are mostly stored as strings rather than Date types.
- In `app.js`, the `allowedOrigins` array is defined but not used; the CORS config repeats the list inline.
