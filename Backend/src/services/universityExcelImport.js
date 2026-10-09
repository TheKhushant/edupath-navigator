const crypto = require("crypto");
const path = require("path");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const University = require("../models/University");
const UniversityCourse = require("../models/UniversityCourse");
const ExcelImport = require("../models/ExcelImport");
const CustomFieldDefinition = require("../models/CustomFieldDefinition");
const {
  CUSTOM_FIELD_TYPES,
  KEY_RE: CUSTOM_KEY_RE,
  MAX_FIELDS_PER_ENTITY,
  MAX_NEW_FIELDS_PER_IMPORT,
  creationEnabled,
  reservedKeysFor,
  definitionError,
  convertCell,
} = require("./customFields");
const { retagModel } = require("./courseSearch");
const {
  clean,
  normalizeName,
  nameParts,
  swappedName,
  createNameMatcher,
} = require("../utils/universityNameMatching");

// ======================================================
// LIMITS
// ======================================================

const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxSheets: 30,
  maxRowsPerSheet: 5000,
  maxColumns: 60,
  maxCellLength: 2000,
  previewRowsPerSheet: 500,
  maxIssuesReturned: 2000,
};

const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];

class ImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ======================================================
// COLUMN DEFINITIONS
// ======================================================

const normalizeHeader = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[*:]+$/, "")
    .trim();

/** Header reduced to words for matching: "GRE / GMAT" -> "gre gmat", "R&D" -> "r and d". */
const canonicalHeader = (value) =>
  normalizeHeader(value)
    .replace(/&/g, " and ")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9%()À-ɏ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const withoutBrackets = (text) => text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

// Values of an awarded degree ("Master of Science (MSc)") vs an applicant's previous degree ("B TECH")
const AWARDED_DEGREE_RE = /\b(master|bachelor|doctor|diplom|magister)\b.*\b(of|in)\b|\((m|b|ph)\.?\s?[a-z]{1,5}\.?\)/i;

// Short degree codes such as "MCA", "B TECH", "B.Sc", "MBA", "BE / BTech"
const DEGREE_CODE_RE = /^[a-z][a-z.\s/&-]{0,14}$/i;

// Standard columns. A header maps to a column automatically on an alias
// match (high confidence), or on a spelling-corrected alias / keyword rule
// (medium confidence). Fuzzy near-misses and headers with more than one
// possible meaning are only suggested; the user maps them in the preview.
//
// One key = one meaning; the sheet type decides which model it is written
// to (see DB_FIELDS / COURSE_DB_FIELDS).
const COLUMNS = [
  {
    key: "name",
    header: "University",
    aliases: ["university", "university name", "name of university", "institution", "institution name"],
    description: "Full official university name. Required on every row.",
    example: "Technical University of Munich (TUM)",
  },
  {
    key: "country",
    header: "Country",
    aliases: ["country", "country name"],
    description: "Country of the university. Required (or set a default country during upload).",
    example: "Germany",
  },
  {
    key: "city",
    header: "City",
    aliases: ["city", "city name"],
    description: "City of the main campus.",
    example: "Munich",
  },
  {
    key: "annualTuitionFee",
    header: "Annual Tuition Fee (EUR)",
    aliases: [
      "annual tuition fee (eur)", "annual tuition fee", "annual tuition fees", "annual tuition",
      "annual fee", "annual fees", "tuition fee per year", "tuition fees per year", "tuition per year",
      "yearly tuition fee", "yearly tuition",
    ],
    rule: (text) => /\b(annual|annually|yearly|per year|a year|per annum|year)\b/.test(text) && /\b(tuition|fees?|costs?)\b/.test(text),
    description: "Annual tuition in EUR: a number or range, optionally with a note in brackets.",
    example: "0-3000 (Semester contribution)",
  },
  {
    key: "tuitionFee",
    header: "Tuition Fees",
    aliases: [
      "tuition fees", "tuition fee", "tuition fee (eur)", "tuition", "fees", "fee", "tuition costs", "tuition cost",
      "course fee", "course fees", "programme fee", "programme fees", "program fee", "program fees",
    ],
    rule: (text) => /\b(tuition|fees?)\b/.test(text) && !/\b(application|semester|annual|yearly|year|per annum)\b/.test(text),
    description: "General tuition note, e.g. \"No tuition fees\". Not the annual amount.",
    example: "No tuition fees",
  },
  {
    key: "englishRequirement",
    header: "IELTS",
    aliases: [
      "ielts", "ielts score", "ielts requirement", "ielts band", "minimum ielts", "ielts overall",
      "english requirement", "english requirements", "english language requirement",
    ],
    rule: (text) => /\bielts\b/.test(text),
    description: "Minimum IELTS band, 0-9 in steps of 0.5.",
    example: "6.5",
  },
  {
    key: "toefl",
    header: "TOEFL",
    aliases: ["toefl", "toefl score", "toefl ibt", "toefl requirement", "minimum toefl"],
    rule: (text) => /\btoefl\b/.test(text),
    description: "TOEFL requirement (iBT 0-120) or note.",
    example: "TOEFL iBT 88",
  },
  {
    key: "requirements",
    header: "Other Requirements",
    aliases: ["other requirements", "requirements", "additional requirements", "other admission requirements"],
    description: "Other requirements separated by semicolons.",
    example: "APS Certificate; GRE for some programs",
  },
  {
    key: "applicationOpens",
    header: "Application Opens",
    aliases: ["application opens", "application start", "application start date", "applications open", "application open date", "application opening"],
    rule: (text) => /\bapplications?\b.*\b(open|opens|opening|start|starts)\b/.test(text),
    description: "Month, month range or date the application window opens.",
    example: "December",
  },
  {
    key: "applicationDeadline",
    header: "Application Deadline",
    aliases: ["application deadline", "application deadlines", "deadline", "deadlines", "last date to apply", "application closes"],
    rule: (text) => /\bdeadlines?\b/.test(text),
    description: "Month, month range or date of the deadline.",
    example: "January-July",
  },
  {
    key: "popularCourses",
    header: "Major Courses",
    // "courses" is also a Course alias; the sheet's other columns and the
    // values decide which one is meant (see resolveAmbiguous).
    aliases: ["major courses", "courses", "popular courses", "major subjects", "core courses", "core modules", "key modules", "modules"],
    description: "Courses separated by commas (semicolons on course sheets).",
    example: "Computer Science, Data Science, Engineering",
  },
  {
    key: "recommendedIndianPercentage",
    header: "Recommended Indian %",
    aliases: ["recommended indian %", "recommended indian percentage", "recommended percentage", "recommended %", "indian %", "minimum indian %"],
    description: "Recommended Indian academic percentage, a number or range (0-100).",
    example: "75-85%+",
  },
  {
    key: "website",
    header: "Official Website",
    aliases: ["official website", "website", "university website", "web site", "homepage"],
    rule: (text) => /\bwebsite\b/.test(text),
    description: "Full URL starting with http:// or https://.",
    example: "https://www.tum.de",
  },
  {
    key: "rankingSource",
    header: "Ranking Source",
    aliases: ["ranking source"],
    description: "Name of the ranking, e.g. QS World University Rankings 2026.",
    example: "QS World University Rankings 2026",
  },
  {
    key: "rank",
    header: "Rank",
    aliases: ["rank", "ranking"],
    // Also matches headers like "Rank (QS World University Rankings 2026)"
    matches: (header) => /^rank(ing)?\b/.test(header) && header !== "ranking source",
    description: "Rank position: a whole number or range such as 201-250.",
    example: "22",
  },
  {
    key: "field",
    header: "Field",
    aliases: ["field", "field of study"],
    description: "Field of study the difficulty applies to.",
    example: "Computer Science / AI / Data Science",
  },
  {
    key: "level",
    header: "Level",
    aliases: ["level", "difficulty", "admission difficulty", "difficulty level", "course difficulty"],
    description: `Admission difficulty: ${["Very Hard", "Hard", "Average", "Medium", "Easy"].join(", ")}.`,
    example: "Very Hard",
  },

  // ---------- Course (programme) columns: one row per course ----------
  {
    key: "courseName",
    header: "Course",
    aliases: [
      "course", "courses", "course name", "course title", "programme", "programmes", "program", "programs",
      "programme name", "program name", "programme title", "program title", "study programme", "study program",
      "degree programme", "degree program", "course programme", "course program",
    ],
    description: "Course / programme name. Required on course rows.",
    example: "MSc Data Science",
  },
  {
    key: "link",
    header: "Links",
    aliases: [
      "links", "link", "url", "urls", "course link", "course url", "programme link", "program link",
      "programme url", "program url", "course page", "programme page", "program page", "source url", "source link",
    ],
    rule: (text) => /\b(links?|urls?)\b/.test(text) && !/\bwebsite\b/.test(text),
    description: "Course page URL (stored as the course source URL).",
    example: "https://www.example.edu/msc-data-science",
  },
  {
    key: "duration",
    header: "Semesters",
    aliases: [
      "semesters", "duration", "course duration", "programme duration", "program duration", "study duration",
      "number of semesters", "standard period of study", "period of study", "length of study",
    ],
    rule: (text) => /\b(duration|semesters|period of study)\b/.test(text),
    description: "Programme length, e.g. \"4 semesters\".",
    example: "4 semesters",
  },
  {
    key: "intake",
    header: "Intake",
    aliases: ["intake", "intakes", "intake months", "start semester", "starting semester", "start date", "commencement"],
    rule: (text) => /\bintakes?\b/.test(text),
    description: "Intake / start semester(s).",
    example: "Winter semester, Summer semester",
  },
  {
    key: "subjectArea",
    header: "Course Category",
    aliases: ["course category", "subject area", "subject", "discipline", "study field", "programme category", "program category"],
    description: "Subject area / course category.",
    example: "Computer Science & Software Engineering",
  },
  {
    key: "category",
    header: "Category",
    aliases: ["category", "categories"],
    description: "Category as given by the source.",
    example: "Mathematics & Statistics",
  },
  {
    key: "degree",
    header: "Degree",
    aliases: ["degree", "degree awarded", "awarded degree", "award", "qualification awarded", "degree type", "academic degree", "degree title"],
    // A second "Degree" column usually lists the applicant's previous degree
    duplicateAlternative: "requiredDegree",
    primaryValues: AWARDED_DEGREE_RE,
    description: "Degree awarded by the course, e.g. Master of Science (MSc).",
    example: "Master of Science (MSc)",
  },
  {
    key: "requiredDegree",
    header: "Required Degree",
    aliases: [
      "required degree", "previous degree", "prior degree", "eligible degree", "eligible degrees",
      "accepted degree", "accepted degrees", "qualifying degree", "bachelor degree required",
    ],
    // Typical values, used when a second "Degree" column is read as this field
    typicalValues: DEGREE_CODE_RE,
    description: "Previous degree the applicant needs, e.g. B.Tech, MCA.",
    example: "B TECH",
  },
  {
    key: "language",
    header: "Language of Instruction",
    aliases: ["language of instruction", "language", "languages", "teaching language", "instruction language", "medium of instruction", "language of teaching"],
    rule: (text) => /\b(language of instruction|teaching language|instruction language|medium of instruction)\b/.test(text),
    description: "Language(s) the course is taught in.",
    example: "English",
  },
  {
    key: "minimumGpa",
    header: "GPA",
    aliases: ["gpa", "minimum gpa", "min gpa", "gpa requirement", "required gpa", "cgpa", "minimum cgpa", "minimum grade", "minimum gpa grade", "grade requirement"],
    rule: (text) => /\bc?gpa\b/.test(text),
    description: "Minimum GPA / grade requirement.",
    example: "German grade 2.5 or better",
  },
  {
    key: "germanRequirement",
    header: "German Requirement",
    aliases: ["german requirement", "german requirements", "german language requirement", "german language", "german level", "german proficiency"],
    rule: (text) => /\bgerman\b/.test(text) && /\b(requirements?|level|proficiency|language)\b/.test(text),
    description: "German language requirement.",
    example: "No minimum German level required",
  },
  {
    key: "eligibility",
    header: "Academic Background Required",
    aliases: [
      "academic background required", "academic background", "academic requirements", "academic requirement",
      "eligibility", "eligibility criteria", "admission requirements", "entry requirements", "background required",
    ],
    rule: (text) => /\b(academic background|eligibility)\b/.test(text),
    description: "Academic background / eligibility the course requires.",
    example: "Bachelor's degree in Computer Science",
  },
  {
    key: "ectsRequired",
    header: "ECTS Required",
    aliases: ["ects required", "required ects", "ects", "ects credits required", "credits required", "minimum ects"],
    rule: (text) => /\bects\b/.test(text),
    description: "ECTS credits the applicant's previous degree must have.",
    example: "180 ECTS",
  },
  {
    key: "gre",
    header: "GRE / GMAT",
    aliases: ["gre gmat", "gre or gmat", "gre", "gmat", "gre gmat requirement", "gre score", "gmat score"],
    rule: (text) => /\b(gre|gmat)\b/.test(text),
    description: "GRE / GMAT requirement.",
    example: "Not required",
  },
  {
    key: "workExperience",
    header: "Work Experience",
    aliases: ["work experience", "work exp", "work experience required", "professional experience", "experience"],
    rule: (text) => /\b(work exp\w*|professional experience)\b/.test(text),
    description: "Work experience requirement.",
    example: "Not required",
  },
  {
    key: "backlogsAllowed",
    header: "Backlogs Allowed",
    aliases: ["backlogs allowed", "backlog allowed", "backlogs", "backlog", "number of backlogs"],
    rule: (text) => /\bbacklogs?\b/.test(text),
    description: "Number of backlogs accepted.",
    example: "Up to 5",
  },
  {
    key: "applicationMethod",
    header: "Application Route",
    aliases: [
      "application route", "application method", "application portal", "application procedure",
      "application process", "application channel", "how to apply", "apply via",
    ],
    rule: (text) => /\bapplication (route|method|portal|procedure|process|channel)\b|\bhow to apply\b/.test(text),
    description: "How to apply, e.g. uni-assist or the university portal.",
    example: "uni-assist",
  },
  {
    key: "apsRequired",
    header: "APS Required",
    aliases: ["aps required", "aps", "aps certificate", "aps requirement"],
    rule: (text) => /\baps\b/.test(text),
    description: "Whether an APS certificate is required.",
    example: "Yes",
  },
  {
    key: "gapAllowed",
    header: "Gap Allowed",
    aliases: ["gap allowed", "gap", "study gap", "gap years allowed", "education gap", "gap accepted"],
    rule: (text) => /\bgaps?\b/.test(text),
    description: "Study gap accepted.",
    example: "2 years",
  },
];

for (const column of COLUMNS) {
  column.canonicalAliases = column.aliases.map(canonicalHeader);
}

const COLUMN_BY_KEY = new Map(COLUMNS.map((column) => [column.key, column]));

// Words used by the aliases, for correcting misspelled headers ("Tution" -> "tuition")
const HEADER_VOCABULARY = new Set(
  COLUMNS.flatMap((column) => column.canonicalAliases.flatMap((alias) => alias.split(" "))).filter((word) => word.length >= 4),
);

// A per-semester amount is never mapped to (annual) tuition automatically
const SEMESTER_FEE_RE = /\bsemester\b.*\b(fees?|tuition|contribution|costs?)\b|\b(fees?|tuition|contribution|costs?)\b.*\bsemester\b/;

// ======================================================
// COLUMN SELECTION / MANUAL MAPPING
//
// The preview lets the user include/exclude every column and pick its
// target field. Selections are optional: without them the import maps
// columns automatically, exactly as before.
// ======================================================

// Target for columns kept as additional info (University / UniversityCourse extraFields)
const EXTRA_FIELD = "extraFields";

// Target for a user-defined field: "custom:<key>" -> record.customFields.<key>
const CUSTOM_PREFIX = "custom:";
const isCustomRef = (field) =>
  typeof field === "string" && field.startsWith(CUSTOM_PREFIX) && CUSTOM_KEY_RE.test(field.slice(CUSTOM_PREFIX.length));
const customKeyOf = (ref) => ref.slice(CUSTOM_PREFIX.length);

// Custom fields belong to the records a sheet type writes
const ENTITY_BY_SHEET_TYPE = { universities: "university", courses: "course" };

// Columns each sheet type actually imports
const USED_BY_TYPE = {
  universities: ["name", "country", "city", "annualTuitionFee", "englishRequirement", "requirements", "applicationOpens", "applicationDeadline", "popularCourses", "recommendedIndianPercentage", "website"],
  courses: [
    "name", "country", "city", "website", "courseName", "link", "duration", "intake", "tuitionFee", "annualTuitionFee",
    "englishRequirement", "toefl", "requirements", "applicationOpens", "applicationDeadline", "minimumGpa", "subjectArea",
    "category", "degree", "requiredDegree", "language", "germanRequirement", "eligibility", "recommendedIndianPercentage",
    "ectsRequired", "gre", "workExperience", "backlogsAllowed", "applicationMethod", "apsRequired", "popularCourses",
    "level", "gapAllowed",
  ],
  rankings: ["name", "rank", "rankingSource", "website"],
  websites: ["name", "website"],
  admissionDifficulty: ["name", "field", "level"],
};

const IMPORTED_TYPES = Object.keys(USED_BY_TYPE);

// Database field each column is written to on university sheets (shown in the mapping summary)
const DB_FIELDS = {
  name: "name",
  country: "country",
  city: "city",
  annualTuitionFee: "annualTuitionFee (+ tuitionFeeMin / tuitionFeeMax)",
  englishRequirement: "englishRequirement",
  requirements: "requirements",
  applicationOpens: "applicationOpens",
  applicationDeadline: "applicationDeadline",
  popularCourses: "popularCourses",
  recommendedIndianPercentage: "recommendedIndianPercentage",
  website: "website",
  rankingSource: "rankingSource",
  rank: "ranking",
  field: "admissionDifficulty.field",
  level: "admissionDifficulty.level",
};

// Course sheets: UniversityCourse field per column (university columns link/create the University)
const COURSE_FIELDS = {
  courseName: "courseName",
  city: "city",
  link: "sourceUrl",
  duration: "duration",
  intake: "intake",
  tuitionFee: "tuitionFee",
  annualTuitionFee: "annualTuitionFee",
  englishRequirement: "ielts",
  toefl: "toefl",
  requirements: "requirements",
  applicationOpens: "applicationStartDate",
  applicationDeadline: "applicationDeadline",
  minimumGpa: "minimumGpa",
  subjectArea: "subjectArea",
  category: "category",
  degree: "degree",
  requiredDegree: "requiredDegree",
  language: "language",
  germanRequirement: "germanRequirement",
  eligibility: "eligibility",
  recommendedIndianPercentage: "recommendedIndianPercentage",
  ectsRequired: "ectsRequired",
  gre: "gre",
  workExperience: "workExperience",
  backlogsAllowed: "backlogsAllowed",
  applicationMethod: "applicationMethod",
  apsRequired: "apsRequired",
  popularCourses: "majorCourses",
  level: "difficulty",
  gapAllowed: "gapAllowed",
};

const COURSE_DB_FIELDS = {
  ...Object.fromEntries(Object.entries(COURSE_FIELDS).map(([key, field]) => [key, `UniversityCourse.${field}`])),
  name: "UniversityCourse.universityId (link; new universities are created)",
  country: "University.country (new universities)",
  website: "University.website (new universities)",
  annualTuitionFee: "UniversityCourse.annualTuitionFee (+ tuitionMin / tuitionMax)",
};

const dbFieldsOf = (key) =>
  Object.fromEntries(
    IMPORTED_TYPES.filter((type) => USED_BY_TYPE[type].includes(key)).map((type) => [
      type,
      type === "courses" ? COURSE_DB_FIELDS[key] : DB_FIELDS[key],
    ]),
  );

/** Target fields offered in the preview's mapping dropdowns. */
const IMPORT_FIELDS = [
  ...COLUMNS.map((column) => {
    const dbFields = dbFieldsOf(column.key);
    return {
      key: column.key,
      label: column.header,
      dbField: dbFields.universities ?? dbFields.courses ?? Object.values(dbFields)[0] ?? column.key,
      dbFields,
      description: column.description,
      sheetTypes: Object.keys(dbFields),
    };
  }),
  {
    key: EXTRA_FIELD,
    label: "Additional info",
    dbField: "extraFields",
    dbFields: Object.fromEntries(IMPORTED_TYPES.map((type) => [type, type === "courses" ? "UniversityCourse.extraFields" : "University.extraFields"])),
    description: "Kept as additional information on the record; not used for search or matching.",
    sheetTypes: IMPORTED_TYPES,
  },
];

const MAPPING_ERROR_CODES = ["unmapped_column", "duplicate_mapping", "field_not_used", "custom_field_unmapped"];

/**
 * Validates user column selections:
 *   { sheets: [{ name, columns: [{ index, include, field }] }] }
 * field: a COLUMNS key, "extraFields", or "" (not mapped).
 * Returns Map(sheetName -> Map(index -> { include, field })) or undefined.
 */
function parseColumnSelections(raw) {
  if (raw === undefined || raw === null) return undefined;

  const invalid = (detail) => new ImportError(`Column selections are invalid: ${detail}`);

  if (typeof raw !== "object" || !Array.isArray(raw.sheets)) throw invalid("expected { sheets: [...] }.");
  if (raw.sheets.length > LIMITS.maxSheets) throw invalid(`more than ${LIMITS.maxSheets} sheets.`);

  const sheets = new Map();

  for (const sheet of raw.sheets) {
    if (typeof sheet?.name !== "string" || !Array.isArray(sheet.columns)) throw invalid("each sheet needs a name and columns.");
    if (sheets.has(sheet.name)) throw invalid(`sheet "${sheet.name}" is listed twice.`);
    if (sheet.columns.length > LIMITS.maxColumns) throw invalid(`more than ${LIMITS.maxColumns} columns on "${sheet.name}".`);

    const columns = new Map();

    for (const column of sheet.columns) {
      const field = column?.field ?? "";

      if (!Number.isInteger(column?.index) || column.index < 0 || column.index >= LIMITS.maxColumns) {
        throw invalid(`bad column index on "${sheet.name}".`);
      }
      if (typeof column.include !== "boolean") throw invalid(`"include" must be true or false on "${sheet.name}".`);
      if (typeof field !== "string" || (field && field !== EXTRA_FIELD && !COLUMN_BY_KEY.has(field) && !isCustomRef(field))) {
        throw new ImportError(`Unsupported database field "${String(field)}" on sheet "${sheet.name}".`);
      }
      if (columns.has(column.index)) throw invalid(`column ${column.index + 1} is listed twice on "${sheet.name}".`);

      columns.set(column.index, { include: column.include, field });
    }

    sheets.set(sheet.name, columns);
  }

  return sheets;
}

/**
 * New custom fields requested with the selections:
 *   customFields: [{ entity: "university" | "course", key, label, type }]
 * Only the shape is checked here; names, types and conflicts are validated
 * against the database in loadCustomCatalog.
 */
function parseNewCustomFields(raw) {
  const list = raw?.customFields;
  if (list === undefined || list === null) return [];

  if (!Array.isArray(list)) throw new ImportError("Column selections are invalid: customFields must be a list.");
  if (list.length > MAX_NEW_FIELDS_PER_IMPORT) {
    throw new ImportError(`At most ${MAX_NEW_FIELDS_PER_IMPORT} new fields can be created in one import.`);
  }

  return list.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ImportError("Column selections are invalid: each custom field must be an object.");
    }
    const { entity, key, label, type } = item;
    if ([entity, key, label, type].some((value) => typeof value !== "string")) {
      throw new ImportError("Column selections are invalid: custom fields need entity, key, label and type.");
    }
    return { entity, key: key.trim(), label: label.trim(), type };
  });
}

/**
 * Saved custom field definitions plus the new ones of this import:
 *   { university: Map(key -> definition), course: Map(key -> definition) }
 * Throws (400/403) for invalid, conflicting or unauthorised new fields.
 */
async function loadCustomCatalog(newDefinitions) {
  const saved = await CustomFieldDefinition.find({}, { _id: 0, entity: 1, key: 1, label: 1, type: 1 }).lean();
  const catalog = { university: new Map(), course: new Map() };

  for (const definition of saved) {
    catalog[definition.entity]?.set(definition.key, { ...definition, isNew: false });
  }

  if (!newDefinitions.length) return catalog;

  if (!creationEnabled()) {
    throw new ImportError("Creating new database fields is disabled on this server (EXCEL_IMPORT_CUSTOM_FIELDS). Map the columns to existing fields or leave them out.", 403);
  }

  const columnKeys = COLUMNS.map((column) => column.key);
  const reserved = {
    university: reservedKeysFor(University, columnKeys),
    course: reservedKeysFor(UniversityCourse, columnKeys),
  };

  for (const definition of newDefinitions) {
    const error = definitionError(definition, reserved);
    if (error) throw new ImportError(error);

    const fields = catalog[definition.entity];
    const existing = [...fields.values()].find((item) => item.key.toLowerCase() === definition.key.toLowerCase());

    if (existing?.isNew) throw new ImportError(`Custom field "${definition.label}" is listed twice.`);

    if (existing) {
      if (existing.key !== definition.key || existing.type !== definition.type) {
        throw new ImportError(
          `A ${definition.entity} field "${existing.label}" (${existing.key}, ${existing.type}) already exists. Map the column to it instead of creating "${definition.label}" (${definition.type}).`,
        );
      }
      continue; // the same field was saved by an earlier import: reuse it
    }

    if (fields.size >= MAX_FIELDS_PER_ENTITY) {
      throw new ImportError(`At most ${MAX_FIELDS_PER_ENTITY} custom ${definition.entity} fields are allowed.`);
    }

    fields.set(definition.key, { ...definition, isNew: true });
  }

  return catalog;
}

const EMPTY_CELL = Object.freeze({ text: "", type: "z", isDate: false });

const MASTER_FIELD_KEYS = [
  "country",
  "city",
  "annualTuitionFee",
  "tuitionFee",
  "englishRequirement",
  "requirements",
  "applicationOpens",
  "applicationDeadline",
  "popularCourses",
  "recommendedIndianPercentage",
];

const DIFFICULTY_LEVELS = ["Very Hard", "Hard", "Average", "Medium", "Easy"];

// UniversityCourse.difficulty enum
const COURSE_DIFFICULTIES = ["Easy", "Medium", "Hard", "Very Hard"];

const SHEET_PURPOSES = {
  universities: "University data (creates or updates universities)",
  courses: "Courses linked to universities (creates or updates courses; creates missing universities)",
  rankings: "Rankings linked to universities",
  websites: "Official websites linked to universities",
  admissionDifficulty: "Admission difficulty by field linked to universities",
  instructions: "Template instructions (not imported)",
  unrecognized: "Not recognized (preserved in the import log, not imported)",
  empty: "Empty sheet",
};

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = temp;
    }
  }

  return previous[b.length];
}

/** Replaces misspelled words with the closest alias word ("tution" -> "tuition"). */
function correctSpelling(text) {
  const corrections = [];

  const words = text.split(" ").map((word) => {
    if (word.length < 5 || HEADER_VOCABULARY.has(word) || /\d/.test(word)) return word;

    const allowed = word.length >= 8 ? 2 : 1;
    let best;
    let tie = false;

    for (const candidate of HEADER_VOCABULARY) {
      if (Math.abs(candidate.length - word.length) > allowed) continue;
      const distance = levenshtein(word, candidate);
      if (distance > allowed) continue;

      if (!best || distance < best.distance) {
        best = { candidate, distance };
        tie = false;
      } else if (distance === best.distance) {
        tie = true;
      }
    }

    if (!best || tie) return word;
    corrections.push(`"${word}" read as "${best.candidate}"`);
    return best.candidate;
  });

  return { text: words.join(" "), corrections };
}

const aliasMatches = (text) =>
  text ? COLUMNS.filter((column) => column.canonicalAliases.includes(text) || column.matches?.(text)) : [];

/**
 * Semantic header match.
 *   { keys: [key], confidence: "high" | "medium", reason }   -> mapped automatically
 *   { keys: [a, b, ...], confidence, reason, ambiguous }     -> resolved from context, else manual
 *   { keys: [key] | [], confidence: "low", reason, suggestOnly } -> suggestion only, manual
 *   undefined                                                -> no match
 */
function matchHeader(header) {
  const canonical = canonicalHeader(header);
  if (!canonical) return undefined;

  const result = (columns, confidence, reason) => {
    const keys = columns.map((column) => column.key);
    return keys.length > 1
      ? { keys, confidence, reason: `${reason}; could mean ${columns.map((column) => column.header).join(" or ")}`, ambiguous: true }
      : { keys, confidence, reason };
  };

  // 1. Alias (with or without a bracketed note such as "(EUR)")
  for (const text of [canonical, withoutBrackets(canonical)]) {
    const found = aliasMatches(text);
    if (found.length) return result(found, "high", "Header matches a known column name");
  }

  // 2. Per-semester amounts are never read as (annual) tuition
  if (SEMESTER_FEE_RE.test(canonical)) {
    return {
      keys: [],
      confidence: "low",
      reason: "Amount per semester: not mapped to annual tuition automatically",
      suggestOnly: true,
    };
  }

  // 3. Misspelled alias
  const { text: corrected, corrections } = correctSpelling(withoutBrackets(canonical));

  if (corrections.length) {
    const found = aliasMatches(corrected);
    if (found.length) return result(found, "medium", `Spelling: ${corrections.join(", ")}`);
  }

  // 4. Keyword rules ("Tuition fee per year" -> annual tuition, "IELTS (Academic)" -> IELTS)
  const byRule = COLUMNS.filter((column) => column.rule?.(corrected));
  if (byRule.length) return result(byRule, "medium", `Header mentions ${byRule.length > 1 ? "several known terms" : `"${byRule[0].header}" terms`}`);

  // 5. Near-miss: suggestion only
  if (corrected.length >= 3) {
    let best;

    for (const column of COLUMNS) {
      for (const alias of column.canonicalAliases) {
        const distance = levenshtein(corrected, alias);
        const allowed = alias.length > 12 ? 3 : 2;

        if (distance <= allowed && (!best || distance < best.distance)) {
          best = { column, distance };
        }
      }
    }

    if (best) {
      return { keys: [best.column.key], confidence: "low", reason: `Similar to "${best.column.header}"`, suggestOnly: true };
    }
  }

  return undefined;
}

/** Column mapped automatically (single, confident match), or undefined. */
function mapHeader(header) {
  const match = matchHeader(header);
  return match && !match.suggestOnly && !match.ambiguous ? COLUMN_BY_KEY.get(match.keys[0]) : undefined;
}


const shareMatching = (values, test) =>
  values.length ? values.filter(test).length / values.length : 0;

// "Computer Science, AI, Data Science" vs "MSc Data Science"
const isListValue = (value) => value.split(/[,;]/).map(clean).filter(Boolean).length >= 2;

/**
 * Picks one meaning for an ambiguous header from the sheet context:
 * a meaning another column already provides is excluded, then the values decide.
 */
function resolveAmbiguous(keys, values, mappedKeys) {
  const free = keys.filter((key) => !mappedKeys.has(key));

  if (free.length === 1) {
    const taken = keys.filter((key) => key !== free[0]).map((key) => COLUMN_BY_KEY.get(key).header);
    return { key: free[0], reason: `"${taken.join(", ")}" is already another column, so this is ${COLUMN_BY_KEY.get(free[0]).header}` };
  }

  if (free.length === 2 && free.includes("courseName") && free.includes("popularCourses") && values.length) {
    const lists = shareMatching(values, isListValue);
    if (lists >= 0.6) return { key: "popularCourses", reason: "Values are lists of courses" };
    if (lists <= 0.2) return { key: "courseName", reason: "Values are single course names" };
  }

  return undefined;
}


// ======================================================
// VALUE PARSING / VALIDATION HELPERS
// ======================================================

const MONTH_RE =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;

// Text saying the source has no information ("Not specified in the official programme source")
const NOT_PROVIDED_RE =
  /^(not\s+(specified|stated|available|listed|published|provided|mentioned|known|applicable)|n\/?a|none|unknown|tbd|tba|to be (announced|confirmed))\b|^[-—–]+$/i;

const FLEXIBLE_DATE_RE =
  /\b(multiple|rolling|varies|various|open|intakes?|dates?|year[- ]round|continuous|tbd|tba)\b/i;

const OTHER_CURRENCY_RE = /\$|£|₹|\busd\b|\bgbp\b|\binr\b|\baud\b|\bcad\b/i;

const extractNumbers = (text) =>
  [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter((number) => Number.isFinite(number));

/** "a; b; c" -> [a, b, c]; commas separate items only when there are no semicolons. */
const splitList = (text) =>
  text.split(text.includes(";") ? ";" : ",").map(clean).filter(Boolean);

/** Date cell -> "YYYY-MM-DD" (from the serial number, independent of the cell format). */
function isoDate(cell) {
  if (cell.serial === undefined) return undefined;

  const date = XLSX.SSF.parse_date_code(cell.serial);
  if (!date?.y) return undefined;

  const pad = (number) => String(number).padStart(2, "0");
  return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
}

/**
 * Annual tuition text -> { min, max } in EUR, from the main statement only
 * ("€0 tuition/year; semester contribution approx. €330" -> 0, not 0-330).
 * Returns { warning } when no amount can be read safely.
 */
function parseTuitionAmount(text) {
  if (OTHER_CURRENCY_RE.test(text)) {
    return {
      code: "tuition_currency",
      warning: "Tuition mentions a currency other than EUR; the numeric range is not stored.",
      suggestion: "Convert the amount to EUR or put the other currency in brackets.",
    };
  }

  const main = withoutBrackets(text.split(";")[0]);
  const range = main.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|to)\s*€?\s*(\d[\d,]*(?:\.\d+)?)/i);
  const toNumber = (value) => Number(value.replace(/,/g, ""));

  if (range) {
    const [min, max] = [toNumber(range[1]), toNumber(range[2])];
    return min <= max
      ? { min, max }
      : { code: "tuition_range", warning: "Tuition range is reversed; the numeric range is not stored.", suggestion: `Use "${max}-${min}".` };
  }

  const [amount] = extractNumbers(main);
  if (amount !== undefined) return { min: amount, max: amount };

  if (/\b(no|free|none)\b|tuition[- ]free/i.test(main)) return { min: 0, max: 0 };

  return {
    code: "tuition_unparsed",
    warning: "Annual tuition amount could not be read; saved as text only.",
    suggestion: "Start the cell with the amount, e.g. \"€1,500 per year\".",
  };
}

const isValidUrl = (text) => {
  if (!/^https?:\/\//i.test(text)) return false;

  try {
    const url = new URL(text);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
};

function validateDateText(text) {
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dmy || iso) {
    const [day, month, year] = iso
      ? [Number(iso[3]), Number(iso[2]), Number(iso[1])]
      : [Number(dmy[1]), Number(dmy[2]), Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])];

    const date = new Date(Date.UTC(year, month - 1, day));
    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;

    return valid
      ? { ok: true }
      : { ok: false, severity: "ERROR", message: "Invalid date", suggestion: "Use DD/MM/YYYY with a real calendar date, or a month name such as \"December\"" };
  }

  if (MONTH_RE.test(text) || FLEXIBLE_DATE_RE.test(text) || NOT_PROVIDED_RE.test(text)) {
    return { ok: true };
  }

  return {
    ok: false,
    severity: "WARNING",
    message: "Not a recognised month or date; stored as text",
    suggestion: "Use a month (\"December\"), a month range (\"January-July\") or a date (DD/MM/YYYY)",
  };
}

// ======================================================
// FILE CHECKS AND WORKBOOK READING
// ======================================================

function checkFile(buffer, fileName) {
  if (!buffer || buffer.length === 0) {
    throw new ImportError("No file was uploaded or the file is empty.");
  }

  if (buffer.length > LIMITS.maxFileBytes) {
    throw new ImportError(`File is larger than ${LIMITS.maxFileBytes / 1024 / 1024} MB.`, 413);
  }

  const extension = path.extname(clean(fileName)).toLowerCase();

  if (extension === ".xlsm" || extension === ".xlsb") {
    throw new ImportError("Macro-enabled or binary workbooks (.xlsm, .xlsb) are not accepted. Save the file as .xlsx.");
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new ImportError(`Unsupported file type "${extension || "none"}". Upload an .xlsx or .xls file.`);
  }

  const signature = buffer.subarray(0, 8).toString("hex");
  const isZip = signature.startsWith("504b0304");
  const isOle = signature === "d0cf11e0a1b11ae1";

  if ((extension === ".xlsx" && !isZip) || (extension === ".xls" && !isOle)) {
    throw new ImportError("The file content is not a valid Excel workbook (file signature does not match its extension).");
  }

  if (isZip && buffer.includes("xl/vbaProject.bin")) {
    throw new ImportError("The workbook contains macros. Macro-enabled workbooks are not accepted.");
  }
}

function readWorkbook(buffer) {
  try {
    // Formulas are never evaluated: SheetJS only reads the cached values.
    return XLSX.read(buffer, {
      type: "buffer",
      cellFormula: true,
      cellHTML: false,
      cellNF: true,
      cellText: true,
      cellDates: false,
      bookVBA: false,
      sheetRows: LIMITS.maxRowsPerSheet + 50,
    });
  } catch (error) {
    throw new ImportError(`The workbook could not be read. It may be corrupted or password-protected. (${error.message})`);
  }
}

const cleanCellText = (value) =>
  // eslint-disable-next-line no-control-regex
  String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

/** Reads the used area of a sheet as rows of { text, type, isDate }. */
function readSheet(sheet) {
  let maxRow = -1;
  let maxColumn = -1;

  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;

    const { r, c } = XLSX.utils.decode_cell(address);
    const cell = sheet[address];

    if (cell && (cell.v !== undefined && cell.v !== null && cell.v !== "")) {
      maxRow = Math.max(maxRow, r);
      maxColumn = Math.max(maxColumn, c);
    }
  }

  const fullRange = sheet["!fullref"] ? XLSX.utils.decode_range(sheet["!fullref"]) : undefined;

  const result = {
    rows: [],
    columnCount: maxColumn + 1,
    formulaCells: 0,
    errorCells: 0,
    truncatedCells: 0,
    tooManyRows: Boolean(fullRange && fullRange.e.r + 1 > LIMITS.maxRowsPerSheet + 50) || maxRow + 1 > LIMITS.maxRowsPerSheet + 20,
    tooManyColumns: maxColumn + 1 > LIMITS.maxColumns,
  };

  const columnLimit = Math.min(maxColumn, LIMITS.maxColumns - 1);

  for (let r = 0; r <= maxRow; r++) {
    const cells = [];

    for (let c = 0; c <= columnLimit; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];

      if (!cell || cell.v === undefined || cell.v === null) {
        cells.push({ text: "", type: "z", isDate: false });
        continue;
      }

      if (cell.f) result.formulaCells++;
      if (cell.t === "e") result.errorCells++;

      let text = cleanCellText(cell.w !== undefined ? cell.w : cell.v);

      if (text.length > LIMITS.maxCellLength) {
        text = text.slice(0, LIMITS.maxCellLength);
        result.truncatedCells++;
      }

      const isDate = cell.t === "d" || (cell.t === "n" && Boolean(cell.z) && XLSX.SSF.is_date(cell.z));

      cells.push({
        text,
        type: cell.t,
        isDate,
        // Raw serial number of date cells, for an unambiguous ISO date
        ...(isDate && typeof cell.v === "number" ? { serial: cell.v } : {}),
      });
    }

    result.rows.push({ rowNumber: r + 1, cells });
  }

  return result;
}

const isBlank = (cells) => cells.every((cell) => !cell.text);

// ======================================================
// ANALYSIS
// ======================================================

/**
 * Scans and validates the workbook and plans the import against the
 * current database. Never writes to MongoDB.
 */
async function analyzeWorkbook(buffer, options) {
  const fileName = clean(options.fileName) || "upload.xlsx";
  const defaultCountry = clean(options.defaultCountry);
  const mode = options.mode === "update" ? "update" : "skip";
  const selections = parseColumnSelections(options.columnSelections);
  const newCustomFields = parseNewCustomFields(options.columnSelections);

  // Progress for the client (rows scanned / validated); yields so a big
  // workbook does not block the server's event loop
  const report = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const pause = () => new Promise((resolve) => setImmediate(resolve));

  checkFile(buffer, fileName);

  report({ phase: "reading" });

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const workbook = readWorkbook(buffer);

  const customCatalog = await loadCustomCatalog(newCustomFields);
  const customDefinitionFor = (sheetType, ref) =>
    isCustomRef(ref) ? customCatalog[ENTITY_BY_SHEET_TYPE[sheetType]]?.get(customKeyOf(ref)) : undefined;
  const anyCustomDefinition = (ref) =>
    customCatalog.university.get(customKeyOf(ref)) ?? customCatalog.course.get(customKeyOf(ref));

  const issues = [];

  const addIssue = (issue) => {
    issues.push({
      severity: issue.severity,
      sheet: issue.sheet ?? "",
      row: issue.row ?? null,
      column: issue.column ?? "",
      code: issue.code,
      message: issue.message,
      value: issue.value ?? "",
      suggestion: issue.suggestion ?? "",
    });
  };

  if (!workbook.SheetNames.length) {
    throw new ImportError("The workbook contains no sheets.");
  }

  for (const [sheetName, columns] of selections ?? []) {
    if (!workbook.SheetNames.slice(0, LIMITS.maxSheets).includes(sheetName)) {
      throw new ImportError(`Column selections refer to sheet "${sheetName}", which is not in this file. Scan the file again.`);
    }

    for (const [index, choice] of columns) {
      if (isCustomRef(choice.field) && !anyCustomDefinition(choice.field)) {
        throw new ImportError(
          `Column ${index + 1} of "${sheetName}" is mapped to the custom field "${customKeyOf(choice.field)}", which does not exist. Add the field (with "Create this field in the database") or choose another field.`,
        );
      }
    }
  }

  if (workbook.SheetNames.length > LIMITS.maxSheets) {
    addIssue({
      severity: "ERROR",
      code: "too_many_sheets",
      message: `Workbook has ${workbook.SheetNames.length} sheets; only the first ${LIMITS.maxSheets} are scanned.`,
      suggestion: "Split the workbook into smaller files.",
    });
  }

  // ---------- Read and classify every sheet ----------

  const sheetNames = workbook.SheetNames.slice(0, LIMITS.maxSheets);
  const sheetData = new Map(sheetNames.map((name) => [name, readSheet(workbook.Sheets[name])]));
  const nonBlankCount = (data) => data.rows.filter((row) => !isBlank(row.cells)).length;
  const rowsDetected = [...sheetData.values()].reduce((total, data) => total + nonBlankCount(data), 0);
  let rowsScanned = 0;

  // rowsDetected stays in the progress state for the rest of the request
  report({ phase: "scanning", totalRows: rowsDetected, processedRows: 0, rowsDetected });

  const analyzeSheet = async (sheetName) => {
    const data = sheetData.get(sheetName);
    const nonBlankRows = data.rows.filter((row) => !isBlank(row.cells));

    const sheetInfo = {
      name: sheetName,
      type: "unrecognized",
      purpose: "",
      headerRowNumber: null,
      headers: [],
      columns: [],
      columnMap: new Map(),
      rowCount: 0,
      columnCount: data.columnCount,
      rows: [],
      raw: data,
      blankRows: 0,
    };

    if (data.formulaCells > 0) {
      addIssue({
        severity: "INFO",
        sheet: sheetName,
        code: "formulas",
        message: `${data.formulaCells} formula cell(s): the saved values are used; formulas are not executed.`,
      });
    }

    if (data.errorCells > 0) {
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "cell_errors",
        message: `${data.errorCells} cell(s) contain Excel errors (e.g. #DIV/0!, #REF!).`,
        suggestion: "Fix the formulas or replace them with values.",
      });
    }

    if (data.truncatedCells > 0) {
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "long_cells",
        message: `${data.truncatedCells} cell(s) were longer than ${LIMITS.maxCellLength} characters and were truncated.`,
      });
    }

    if (data.tooManyRows) {
      addIssue({
        severity: "ERROR",
        sheet: sheetName,
        code: "too_many_rows",
        message: `Sheet has more than ${LIMITS.maxRowsPerSheet} rows and will not be imported.`,
        suggestion: "Split the sheet into smaller files.",
      });
    }

    if (data.tooManyColumns) {
      addIssue({
        severity: "ERROR",
        sheet: sheetName,
        code: "too_many_columns",
        message: `Sheet has more than ${LIMITS.maxColumns} columns; extra columns are ignored and the sheet will not be imported.`,
      });
    }

    if (nonBlankRows.length === 0) {
      sheetInfo.type = "empty";
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "empty_sheet",
        message: "Sheet is empty.",
      });
      return sheetInfo;
    }

    if (normalizeHeader(sheetName) === "instructions") {
      sheetInfo.type = "instructions";
      sheetInfo.headerRowNumber = nonBlankRows[0].rowNumber;
      sheetInfo.headers = nonBlankRows[0].cells.map((cell) => cell.text);
      addIssue({
        severity: "INFO",
        sheet: sheetName,
        code: "instructions_sheet",
        message: "Template instructions sheet; not imported.",
      });
    } else {
      // Header row = first of the top rows containing a "University" column
      const headerRow =
        nonBlankRows
          .slice(0, 15)
          .find((row) => row.cells.some((cell) => mapHeader(normalizeHeader(cell.text))?.key === "name")) ??
        nonBlankRows[0];

      sheetInfo.headerRowNumber = headerRow.rowNumber;
      sheetInfo.headers = headerRow.cells.map((cell) => cell.text);

      if (headerRow !== nonBlankRows[0]) {
        addIssue({
          severity: "INFO",
          sheet: sheetName,
          row: headerRow.rowNumber,
          code: "header_offset",
          message: `Column headers found on row ${headerRow.rowNumber}; rows above it are treated as a title.`,
        });
      }
    }

    // ---------- Map columns ----------

    const selection = sheetInfo.type === "instructions" ? undefined : selections?.get(sheetName);

    for (const index of selection?.keys() ?? []) {
      if (index >= sheetInfo.headers.length) {
        throw new ImportError(`Column selections refer to column ${index + 1} of "${sheetName}", which has no header. Scan the file again.`);
      }
    }

    // Mapping problems become errors only if the sheet turns out to be imported
    sheetInfo.mappingIssues = [];
    sheetInfo.excluded = new Set();

    // Non-empty values per column (before any exclusion): samples for the
    // preview, and context for headers with more than one possible meaning
    const valuesByColumn = sheetInfo.headers.map(() => []);

    for (const row of data.rows) {
      if (row.rowNumber <= (sheetInfo.headerRowNumber ?? 0)) continue;
      row.cells.forEach((cell, index) => {
        if (cell.text && valuesByColumn[index]?.length < 200) valuesByColumn[index].push(cell.text);
      });
    }

    sheetInfo.samples = valuesByColumn.map((values) =>
      [...new Set(values)].slice(0, 3).map((value) => (value.length > 120 ? `${value.slice(0, 117)}...` : value)),
    );

    const matches = sheetInfo.headers.map((header) => (sheetInfo.type === "instructions" ? undefined : matchHeader(header)));
    const autoKey = (index) => {
      const match = matches[index];
      return match && !match.suggestOnly && !match.ambiguous ? match.keys[0] : undefined;
    };
    const matchInfo = (index) => {
      const match = matches[index];
      if (!match) return {};
      return {
        confidence: match.confidence,
        matchReason: match.reason,
        ...(match.ambiguous ? { candidates: match.keys } : {}),
      };
    };
    const labelOf = (index) => sheetInfo.headers[index] || `Column ${index + 1}`;

    /**
     * Two columns with the same automatic field (e.g. two "Degree" columns):
     * returns the field's usual second meaning for this column when the values
     * leave no doubt - the other column holds the first meaning ("Master of
     * Science (MSc)") and this one holds typical values of the second ("MCA",
     * "B TECH"). Otherwise undefined, and the user decides in the preview.
     */
    const confidentAlternative = (index) => {
      const key = autoKey(index);
      const column = key && COLUMN_BY_KEY.get(key);
      const alternative = column?.duplicateAlternative && COLUMN_BY_KEY.get(column.duplicateAlternative);
      if (!column?.primaryValues || !alternative?.typicalValues) return undefined;

      const others = sheetInfo.headers.map((_, other) => other).filter((other) => other !== index && autoKey(other) === key);
      if (others.length !== 1 || !valuesByColumn[index].length) return undefined;

      const share = (at, pattern) => shareMatching(valuesByColumn[at], (value) => pattern.test(value));
      const clear =
        share(others[0], column.primaryValues) >= 0.8 &&
        share(index, column.primaryValues) <= 0.2 &&
        share(index, alternative.typicalValues) >= 0.8;

      return clear ? alternative.key : undefined;
    };

    const columns = new Array(sheetInfo.headers.length);

    // 1. The user's choices
    sheetInfo.headers.forEach((header, index) => {
      const choice = selection?.get(index);
      if (!choice) return;

      const label = labelOf(index);
      // Automatic field for comparison in the preview ("Auto-mapped" vs "Manual"); an
      // ambiguous header is resolved against the automatic fields of the other columns
      const otherAutoKeys = new Set(matches.map((_, other) => other !== index && autoKey(other)).filter(Boolean));
      const autoField =
        confidentAlternative(index) ??
        autoKey(index) ??
        (matches[index]?.ambiguous ? resolveAmbiguous(matches[index].keys, valuesByColumn[index], otherAutoKeys)?.key : undefined);
      const alternativeKey = confidentAlternative(index);
      const base = {
        index,
        header,
        selected: true,
        autoField,
        ...matchInfo(index),
        // Same explanation as the automatic scan gives for this column
        ...(alternativeKey
          ? {
              confidence: "medium",
              matchReason: `Second "${header}" column with short degree codes (e.g. ${valuesByColumn[index].slice(0, 2).join(", ")}), read as ${COLUMN_BY_KEY.get(alternativeKey).header}`,
            }
          : {}),
      };

      if (!choice.include) {
        sheetInfo.excluded.add(index);
        columns[index] = { ...base, status: "excluded" };
        return;
      }

      if (choice.field === EXTRA_FIELD) {
        columns[index] = { ...base, status: "unexpected" };
        return;
      }

      if (!choice.field) {
        sheetInfo.mappingIssues.push({
          code: "unmapped_column",
          column: label,
          message: `Column "${label}" is selected but not mapped to a database field.`,
          suggestion: "Choose a database field (or \"Additional info\") for it, or uncheck the column.",
        });
        columns[index] = { ...base, status: "unmapped" };
        return;
      }

      const column = COLUMN_BY_KEY.get(choice.field) ?? {
        key: choice.field,
        header: `${anyCustomDefinition(choice.field).label} (custom field)`,
      };

      if (sheetInfo.columnMap.has(column.key)) {
        sheetInfo.mappingIssues.push({
          code: "duplicate_mapping",
          column: label,
          message: `Columns "${labelOf(sheetInfo.columnMap.get(column.key))}" and "${label}" are both mapped to ${column.header}.`,
          suggestion: "Map each database field from one column only, or uncheck one of the columns.",
        });
        columns[index] = { ...base, status: "duplicate" };
        return;
      }

      sheetInfo.columnMap.set(column.key, index);
      columns[index] = { ...base, status: "mapped", mappedTo: column.key, mappedHeader: column.header };
    });

    // 2. Columns with one confident match
    sheetInfo.headers.forEach((header, index) => {
      if (columns[index]) return;

      if (!normalizeHeader(header)) {
        columns[index] = { index, header: "", status: "empty" };
        return;
      }

      if (sheetInfo.type === "instructions") {
        columns[index] = { index, header, status: "unexpected" };
        return;
      }

      const key = autoKey(index);
      if (!key) return;

      const column = COLUMN_BY_KEY.get(key);
      const mapped = (at) => ({
        index: at,
        header: sheetInfo.headers[at],
        status: "mapped",
        mappedTo: key,
        mappedHeader: column.header,
        autoField: key,
        ...matchInfo(at),
      });

      if (!sheetInfo.columnMap.has(key)) {
        sheetInfo.columnMap.set(key, index);
        columns[index] = mapped(index);
        return;
      }

      const firstIndex = sheetInfo.columnMap.get(key);
      const alternative = column.duplicateAlternative && COLUMN_BY_KEY.get(column.duplicateAlternative);

      // Same meaning twice, and the field has a usual second meaning (a second
      // "Degree" column normally lists the applicant's previous degree). The
      // column whose values fit the first meaning keeps it; the other one is
      // suggested only, so the user confirms it in the preview.
      if (alternative && !sheetInfo.columnMap.has(alternative.key)) {
        const score = (at) =>
          column.primaryValues ? shareMatching(valuesByColumn[at], (value) => column.primaryValues.test(value)) : 0;
        const swap = !columns[firstIndex]?.selected && score(index) > score(firstIndex);
        const primary = swap ? index : firstIndex;
        const secondary = swap ? firstIndex : index;

        if (swap) {
          sheetInfo.columnMap.set(key, primary);
          columns[primary] = mapped(primary);
        }

        if (confidentAlternative(secondary) === alternative.key) {
          sheetInfo.columnMap.set(alternative.key, secondary);
          columns[secondary] = {
            index: secondary,
            header: sheetInfo.headers[secondary],
            status: "mapped",
            mappedTo: alternative.key,
            mappedHeader: alternative.header,
            autoField: alternative.key,
            confidence: "medium",
            matchReason: `Second "${column.header}" column: "${labelOf(primary)}" holds degree names, this one short degree codes (e.g. ${valuesByColumn[secondary].slice(0, 2).join(", ")}), so it is read as ${alternative.header}`,
          };
          return;
        }

        columns[secondary] = {
          index: secondary,
          header: sheetInfo.headers[secondary],
          status: "suggested",
          suggestion: alternative.header,
          suggestionField: alternative.key,
          candidates: [key, alternative.key],
          confidence: "low",
          matchReason: `Second "${column.header}" column ("${labelOf(primary)}" is mapped to ${column.header}); probably ${alternative.header}`,
        };
        return;
      }

      addIssue({
        severity: "ERROR",
        sheet: sheetName,
        row: sheetInfo.headerRowNumber,
        column: header,
        code: "duplicate_column",
        message: `Column "${header}" duplicates "${sheetInfo.headers[firstIndex]}" (both map to ${column.header}).`,
        suggestion: "Remove or rename one of the columns, or map it to another field in the preview.",
      });
      columns[index] = { index, header, status: "duplicate", autoField: key, ...matchInfo(index) };
    });

    // 3. Headers with several possible meanings, suggestions and unknown headers
    sheetInfo.headers.forEach((header, index) => {
      if (columns[index]) return;

      const match = matches[index];
      const base = { index, header, ...matchInfo(index) };

      if (match?.ambiguous) {
        const resolved = resolveAmbiguous(match.keys, valuesByColumn[index], sheetInfo.columnMap);

        if (resolved) {
          const column = COLUMN_BY_KEY.get(resolved.key);
          sheetInfo.columnMap.set(resolved.key, index);
          columns[index] = {
            ...base,
            status: "mapped",
            mappedTo: resolved.key,
            mappedHeader: column.header,
            autoField: resolved.key,
            confidence: "medium",
            matchReason: resolved.reason,
          };
          return;
        }

        columns[index] = {
          ...base,
          status: "suggested",
          confidence: "low",
          suggestion: COLUMN_BY_KEY.get(match.keys[0]).header,
          suggestionField: match.keys[0],
        };
        return;
      }

      if (match?.keys.length) {
        const column = COLUMN_BY_KEY.get(match.keys[0]);
        columns[index] = { ...base, status: "suggested", suggestion: column.header, suggestionField: column.key };
        return;
      }

      columns[index] = { ...base, status: "unexpected" };
    });

    // Unmapped user choices keep the automatic suggestion, so the preview can offer it again
    for (const column of columns) {
      if (!column?.selected || column.status !== "unmapped") continue;

      const match = matches[column.index];
      const key = autoKey(column.index);
      const alternative = key && COLUMN_BY_KEY.get(key).duplicateAlternative;

      if (key && sheetInfo.columnMap.has(key)) {
        if (alternative && !sheetInfo.columnMap.has(alternative)) {
          Object.assign(column, {
            suggestion: COLUMN_BY_KEY.get(alternative).header,
            suggestionField: alternative,
            candidates: [key, alternative],
          });
        }
      } else if (match?.keys.length) {
        Object.assign(column, {
          suggestion: COLUMN_BY_KEY.get(match.keys[0]).header,
          suggestionField: match.keys[0],
        });
      }
    }

    sheetInfo.columns = columns;

    // ---------- Detect sheet type from its columns ----------

    if (sheetInfo.type !== "instructions") {
      const has = (key) => sheetInfo.columnMap.has(key);

      if (has("name") && has("courseName")) sheetInfo.type = "courses";
      else if (has("name") && MASTER_FIELD_KEYS.some(has)) sheetInfo.type = "universities";
      else if (has("name") && has("rank")) sheetInfo.type = "rankings";
      else if (has("name") && has("field") && has("level")) sheetInfo.type = "admissionDifficulty";
      else if (has("name") && has("website")) sheetInfo.type = "websites";
      else sheetInfo.type = "unrecognized";

      // University sheets have always read "Tuition Fee" as the annual amount
      if (sheetInfo.type === "universities" && has("tuitionFee") && !has("annualTuitionFee")) {
        const column = sheetInfo.columns[sheetInfo.columnMap.get("tuitionFee")];

        if (!column.selected) {
          sheetInfo.columnMap.delete("tuitionFee");
          sheetInfo.columnMap.set("annualTuitionFee", column.index);
          Object.assign(column, {
            mappedTo: "annualTuitionFee",
            mappedHeader: COLUMN_BY_KEY.get("annualTuitionFee").header,
            autoField: "annualTuitionFee",
            matchReason: "University sheet without an annual tuition column: read as the annual tuition fee",
          });
        }
      }

      if (sheetInfo.type === "unrecognized") {
        addIssue({
          severity: "WARNING",
          sheet: sheetName,
          code: "unrecognized_sheet",
          message: has("courseName")
            ? "Sheet has a Course column but no \"University\" column, so courses cannot be linked. It will not be imported; its data is preserved in the import log."
            : has("name")
              ? "Sheet has a University column but no recognised data columns. It will not be imported; its data is preserved in the import log."
              : "Sheet has no \"University\" column, so its structure is not recognised. It will not be imported; its data is preserved in the import log.",
          suggestion: "Use the column names from the Excel template, or map the University column in the preview, if this sheet should be imported.",
        });
      }

      // Headers matching a custom field saved by an earlier import
      const entity = ENTITY_BY_SHEET_TYPE[sheetInfo.type];

      for (const column of entity ? sheetInfo.columns : []) {
        if (column.selected || column.status !== "unexpected" || !column.header) continue;

        const header = canonicalHeader(column.header);
        const saved = [...customCatalog[entity].values()].find(
          (definition) =>
            !definition.isNew &&
            (canonicalHeader(definition.label) === header || definition.key.toLowerCase() === header.replace(/ /g, "")),
        );
        const ref = saved && `${CUSTOM_PREFIX}${saved.key}`;

        if (!saved || sheetInfo.columnMap.has(ref)) continue;

        sheetInfo.columnMap.set(ref, column.index);
        Object.assign(column, {
          status: "mapped",
          mappedTo: ref,
          mappedHeader: `${saved.label} (custom field)`,
          autoField: ref,
          confidence: "high",
          matchReason: `Matches the custom field "${saved.label}" (${saved.type}) saved by an earlier import`,
        });
      }

      if (IMPORTED_TYPES.includes(sheetInfo.type)) {
        const usedByType = USED_BY_TYPE[sheetInfo.type];
        const isUsed = (key) =>
          isCustomRef(key) ? Boolean(customDefinitionFor(sheetInfo.type, key)) : usedByType.includes(key);
        const sheetLabel = SHEET_PURPOSES[sheetInfo.type].split(" (")[0].toLowerCase();

        for (const column of sheetInfo.columns) {
          if (column.status === "mapped" && !isUsed(column.mappedTo) && column.selected) {
            sheetInfo.mappingIssues.push({
              code: "field_not_used",
              column: column.header || `Column ${column.index + 1}`,
              message: `"${column.mappedHeader}" is not imported on a ${sheetLabel} sheet.`,
              suggestion: `Map the column to a field used on this sheet, choose "Additional info", or uncheck it.`,
            });
            column.status = "unexpected";
          } else if (column.status === "mapped" && !isUsed(column.mappedTo)) {
            column.status = "unexpected";
            addIssue({
              severity: "INFO",
              sheet: sheetName,
              column: column.header,
              code: "column_not_used",
              message: `Column "${column.header}" is not used on a ${sheetLabel} sheet; values are preserved.`,
            });
          } else if (column.status === "mapped" && !column.selected && column.confidence === "medium") {
            addIssue({
              severity: "INFO",
              sheet: sheetName,
              column: column.header,
              code: "column_matched",
              message: `Column "${column.header}" mapped to ${column.mappedHeader} (${column.matchReason}). Check the mapping in the preview.`,
              value: column.header,
            });
          } else if (column.status === "suggested") {
            addIssue({
              severity: "WARNING",
              sheet: sheetName,
              column: column.header,
              code: column.candidates ? "ambiguous_column" : "column_name",
              message: column.candidates
                ? `Column "${column.header}" could mean ${column.candidates.map((key) => COLUMN_BY_KEY.get(key).header).join(" or ")} (${column.matchReason}). It is not mapped automatically; values are preserved.`
                : `Column "${column.header}" is not a template column. It looks like "${column.suggestion}" but is not mapped automatically; values are preserved.`,
              value: column.header,
              suggestion: `Choose the field in the column mapping (suggested: "${column.suggestion}"), or rename the column.`,
            });
          } else if (column.status === "unexpected" && !column.selected) {
            addIssue({
              severity: "INFO",
              sheet: sheetName,
              column: column.header,
              code: "extra_column",
              message: column.matchReason
                ? `Column "${column.header}": ${column.matchReason}. Values are preserved; map it in the preview if needed.`
                : `Column "${column.header}" is not part of the standard template but will be preserved.`,
            });
          }
        }

        if (sheetInfo.type === "universities" && !has("country")) {
          addIssue({
            severity: defaultCountry ? "INFO" : "ERROR",
            sheet: sheetName,
            column: "Country",
            code: "missing_country_column",
            message: defaultCountry
              ? `No Country column; the default country "${defaultCountry}" is applied to every row.`
              : "Required column \"Country\" is missing.",
            suggestion: defaultCountry ? "" : "Add a Country column or set a default country before scanning.",
          });
        }

        if (sheetInfo.type === "courses" && !has("country")) {
          addIssue({
            severity: defaultCountry ? "INFO" : "WARNING",
            sheet: sheetName,
            column: "Country",
            code: "missing_country_column",
            message: defaultCountry
              ? `No Country column; the default country "${defaultCountry}" is used for universities created from this sheet.`
              : "No Country column: courses can only be linked to existing universities; universities that do not exist yet cannot be created.",
            suggestion: defaultCountry ? "" : "Add a Country column or set a default country before scanning.",
          });
        }
      }
    }

    sheetInfo.purpose = SHEET_PURPOSES[sheetInfo.type];

    if (sheetInfo.mappingIssues.length) {
      if (IMPORTED_TYPES.includes(sheetInfo.type)) {
        sheetInfo.mappingIssues.forEach((issue) =>
          addIssue({ severity: "ERROR", sheet: sheetName, row: null, ...issue }),
        );
      } else {
        addIssue({
          severity: "INFO",
          sheet: sheetName,
          code: "mapping_ignored",
          message: "This sheet is not imported, so its column mapping is not checked.",
          suggestion: "Map a column to University (and its data columns) if this sheet should be imported.",
        });
      }
    }

    // ---------- Data rows ----------

    // Unchecked columns are blanked here, so their values reach neither the
    // university fields, extraFields/sourceRow, nor the import log.
    const withoutExcluded = (cells) =>
      sheetInfo.excluded.size ? cells.map((cell, index) => (sheetInfo.excluded.has(index) ? EMPTY_CELL : cell)) : cells;

    const headerNorm = sheetInfo.headers
      .map((header, index) => (sheetInfo.excluded.has(index) ? "" : normalizeHeader(header)))
      .join("|");

    for (const sourceRow of data.rows) {
      if (sourceRow.rowNumber <= (sheetInfo.headerRowNumber ?? 0)) continue;

      const row = { rowNumber: sourceRow.rowNumber, cells: withoutExcluded(sourceRow.cells) };

      if (isBlank(row.cells)) {
        sheetInfo.blankRows++;
        continue;
      }

      if (++rowsScanned % 500 === 0) {
        report({ processedRows: Math.min(rowsScanned, rowsDetected) });
        await pause();
      }

      const texts = row.cells.map((cell) => cell.text);
      const isRepeatedHeader = texts.map(normalizeHeader).join("|") === headerNorm;

      const original = {};
      sheetInfo.headers.forEach((header, index) => {
        const value = texts[index];
        if (value) original[header || `Column ${index + 1}`] = value;
      });
      texts.forEach((value, index) => {
        if (index >= sheetInfo.headers.length && value) original[`Column ${index + 1}`] = value;
      });

      sheetInfo.rows.push({
        rowNumber: row.rowNumber,
        cells: row.cells,
        texts,
        original,
        status: isRepeatedHeader ? "header" : "pending",
        action: "",
      });

      if (isRepeatedHeader) {
        addIssue({
          severity: "INFO",
          sheet: sheetName,
          row: row.rowNumber,
          code: "repeated_header",
          message: "Repeated header row skipped.",
        });
      }
    }

    sheetInfo.rowCount = sheetInfo.rows.length;

    if (sheetInfo.blankRows > 0) {
      addIssue({
        severity: "INFO",
        sheet: sheetName,
        code: "blank_rows",
        message: `${sheetInfo.blankRows} blank row(s) ignored.`,
      });
    }

    if (IMPORTED_TYPES.includes(sheetInfo.type) &&
        sheetInfo.rows.every((row) => row.status === "header")) {
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "no_data_rows",
        message: "Sheet has column headers but no data rows.",
      });
    }

    if (data.tooManyRows || data.tooManyColumns) {
      sheetInfo.blocked = true;
    }

    return sheetInfo;
  };

  const sheets = [];
  let rowsInFinishedSheets = 0;

  for (const sheetName of sheetNames) {
    sheets.push(await analyzeSheet(sheetName));
    rowsInFinishedSheets += nonBlankCount(sheetData.get(sheetName));
    rowsScanned = rowsInFinishedSheets;
    report({ processedRows: rowsScanned });
  }

  // New custom fields must receive values from a column of an imported sheet
  for (const definition of [...customCatalog.university.values(), ...customCatalog.course.values()]) {
    if (!definition.isNew) continue;

    const ref = `${CUSTOM_PREFIX}${definition.key}`;
    const used = sheets.some(
      (sheet) => ENTITY_BY_SHEET_TYPE[sheet.type] === definition.entity && sheet.columnMap.has(ref),
    );

    if (!used) {
      addIssue({
        severity: "ERROR",
        code: "custom_field_unmapped",
        column: definition.label,
        message: `New ${definition.entity} field "${definition.label}" has no Excel column mapped to it on a ${definition.entity === "course" ? "course" : "university"} sheet, so it would stay empty.`,
        suggestion: "Map an Excel column to it, or remove the new column / untick \"Create this field in the database\".",
      });
    }
  }

  // ---------- Helpers bound to a sheet/row ----------

  const cellOf = (sheetInfo, row, key) => {
    const index = sheetInfo.columnMap.get(key);
    return index === undefined ? undefined : row.cells[index] ?? { text: "", type: "z", isDate: false };
  };

  const headerOf = (sheetInfo, key) => {
    const index = sheetInfo.columnMap.get(key);
    return index === undefined ? COLUMN_BY_KEY.get(key).header : sheetInfo.headers[index];
  };

  const extraFieldsOf = (sheetInfo, row) => {
    const extra = {};
    sheetInfo.columns.forEach((column) => {
      if (!["mapped", "empty", "excluded"].includes(column.status) && row.texts[column.index]) {
        extra[column.header || `Column ${column.index + 1}`] = row.texts[column.index];
      }
    });
    return Object.keys(extra).length ? extra : undefined;
  };

  /** Values of the custom-field columns, converted to each field's type. */
  const customValuesOf = (sheetInfo, row, issue) => {
    const values = {};

    for (const [ref, index] of sheetInfo.columnMap) {
      const definition = customDefinitionFor(sheetInfo.type, ref);
      const cell = row.cells[index];
      if (!definition || !cell?.text) continue;

      const result = convertCell(definition.type, cell);

      if (result.error) {
        issue(
          ref,
          "WARNING",
          "custom_value_invalid",
          `${definition.label} (${definition.type}): ${result.error} Not stored in this field (kept in the original row).`,
          result.suggestion ?? "",
        );
      } else {
        values[definition.key] = result.value;
      }
    }

    return Object.keys(values).length ? values : undefined;
  };

  // Progress while validating the rows of imported sheets
  const rowsToValidate = sheets
    .filter((sheet) => IMPORTED_TYPES.includes(sheet.type))
    .reduce((total, sheet) => total + sheet.rows.filter((row) => row.status !== "header").length, 0);
  let rowsValidated = 0;
  const rowValidated = async () => {
    if (++rowsValidated % 250 === 0) {
      report({ processedRows: Math.min(rowsValidated, rowsToValidate) });
      await pause();
    }
  };

  report({ phase: "validating", totalRows: rowsToValidate, processedRows: 0 });

  // ======================================================
  // MASTER (UNIVERSITY) ROWS
  // ======================================================

  const masterRecords = [];

  for (const sheetInfo of sheets.filter((sheet) => sheet.type === "universities")) {
    for (const row of sheetInfo.rows) {
      if (row.status === "header") continue;
      await rowValidated();

      if (sheetInfo.blocked) {
        row.status = "invalid";
        continue;
      }

      const rowIssues = [];
      const issue = (key, severity, code, message, suggestion = "", value) => {
        rowIssues.push(severity);
        addIssue({
          severity,
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: key ? headerOf(sheetInfo, key) : "",
          code,
          message,
          value: value ?? (key ? cellOf(sheetInfo, row, key)?.text ?? "" : ""),
          suggestion,
        });
      };

      const text = (key) => cellOf(sheetInfo, row, key)?.text ?? "";
      const record = {};

      // University name
      const nameCell = cellOf(sheetInfo, row, "name");

      if (!nameCell.text) {
        issue("name", "ERROR", "missing_name", "University name is missing.", "Enter the university name or delete the row.");
      } else if (nameCell.type === "n" || nameCell.type === "b") {
        issue("name", "ERROR", "invalid_type", "University name must be text, not a number or TRUE/FALSE.");
      } else if (nameCell.text.length < 3 || nameCell.text.length > 200) {
        issue("name", "ERROR", "invalid_name", "University name must be between 3 and 200 characters.");
      } else {
        record.name = nameCell.text;
      }

      // Country
      const countryCell = cellOf(sheetInfo, row, "country");

      if (countryCell?.text) {
        if (countryCell.type === "n" || /\d/.test(countryCell.text)) {
          issue("country", "ERROR", "invalid_country", "Country must be a country name.", "Enter the country name, e.g. \"Germany\".");
        } else {
          record.country = countryCell.text;
        }
      } else if (defaultCountry) {
        record.country = defaultCountry;
        if (countryCell) {
          issue("country", "INFO", "default_country", `Country is empty; default "${defaultCountry}" applied.`);
        }
      } else {
        issue("country", "ERROR", "missing_country", "Country is required.", "Fill in the Country cell or set a default country before scanning.");
      }

      // City
      if (text("city")) {
        if (cellOf(sheetInfo, row, "city").type === "n") {
          issue("city", "WARNING", "invalid_type", "City is a number; stored as text.");
        }
        record.city = text("city");
      }

      // Tuition
      const tuitionText = text("annualTuitionFee");
      if (tuitionText) {
        record.annualTuitionFee = tuitionText;
        const numbers = extractNumbers(tuitionText.replace(/\(.*\)/, ""));

        if (OTHER_CURRENCY_RE.test(tuitionText)) {
          issue("annualTuitionFee", "WARNING", "tuition_currency", "Tuition mentions a currency other than EUR; the numeric range is not stored.", "Convert the amount to EUR or leave the note in brackets.");
        } else if (numbers.length === 0) {
          issue("annualTuitionFee", "WARNING", "tuition_unparsed", "Tuition value could not be parsed; saved as text only.", "Use a number or range such as \"0-3000\".");
        } else if (numbers.length >= 2 && numbers[0] > numbers[1]) {
          issue("annualTuitionFee", "ERROR", "tuition_range", "Tuition range is reversed (minimum is larger than maximum).", `Use "${numbers[1]}-${numbers[0]}".`);
        } else {
          record.tuitionFeeMin = numbers[0];
          record.tuitionFeeMax = numbers[1] ?? numbers[0];
        }
      }

      // IELTS
      const ieltsCell = cellOf(sheetInfo, row, "englishRequirement");
      if (ieltsCell?.text) {
        const band = ieltsCell.type === "n" ? Number(ieltsCell.text) : extractNumbers(ieltsCell.text)[0];

        if (ieltsCell.isDate) {
          issue("englishRequirement", "ERROR", "invalid_type", "IELTS cell is formatted as a date.", "Format the cell as a number, e.g. 6.5.");
        } else if (band === undefined || Number.isNaN(band)) {
          issue("englishRequirement", "WARNING", "ielts_unparsed", "IELTS value could not be parsed; saved as text.", "Use a band such as 6.5.");
          record.englishRequirement = ieltsCell.text;
        } else if (band < 0 || band > 9) {
          issue("englishRequirement", "ERROR", "ielts_range", "IELTS must be between 0 and 9.");
        } else {
          if (band * 2 !== Math.round(band * 2)) {
            issue("englishRequirement", "WARNING", "ielts_step", "IELTS bands are normally in steps of 0.5.");
          }
          record.englishRequirement = ieltsCell.text;
        }
      }

      // Requirements / courses
      if (text("requirements")) {
        record.requirements = text("requirements").split(";").map(clean).filter(Boolean);
      }

      if (text("popularCourses")) {
        record.popularCourses = text("popularCourses").split(",").map(clean).filter(Boolean);
      }

      // Application dates
      for (const key of ["applicationOpens", "applicationDeadline"]) {
        const cell = cellOf(sheetInfo, row, key);
        if (!cell?.text) continue;

        if (!cell.isDate) {
          const check = validateDateText(cell.text);
          if (!check.ok) {
            issue(key, check.severity, "invalid_date", check.message, check.suggestion);
            if (check.severity === "ERROR") continue;
          }
        }

        record[key] = cell.text;
      }

      // Recommended %
      const percentText = text("recommendedIndianPercentage");
      if (percentText) {
        const numbers = extractNumbers(percentText);

        if (numbers.length === 0) {
          issue("recommendedIndianPercentage", "WARNING", "percentage_unparsed", "Percentage could not be parsed; saved as text.", "Use a value such as \"75%\" or \"70-80%+\".");
          record.recommendedIndianPercentage = percentText;
        } else if (numbers.some((number) => number > 100)) {
          issue("recommendedIndianPercentage", "ERROR", "percentage_range", "Percentage must be between 0 and 100.");
        } else if (numbers.length >= 2 && numbers[0] > numbers[1]) {
          issue("recommendedIndianPercentage", "ERROR", "percentage_range", "Percentage range is reversed.", `Use "${numbers[1]}-${numbers[0]}%".`);
        } else {
          record.recommendedIndianPercentage = percentText;
        }
      }

      // Website
      const websiteText = text("website");
      if (websiteText) {
        if (isValidUrl(websiteText)) {
          record.website = websiteText;
        } else {
          issue("website", "WARNING", "invalid_url", "Website is not a valid URL; it is not stored on the university (kept in the original row).", /^www\./i.test(websiteText) ? `Use "https://${websiteText}".` : "Use a full URL starting with https://.");
        }
      }

      const customValues = customValuesOf(sheetInfo, row, issue);
      if (customValues) record.customFields = customValues;

      row.status = rowIssues.includes("ERROR") ? "invalid" : "valid";

      if (row.status === "valid") {
        masterRecords.push({
          sheet: sheetInfo.name,
          rowNumber: row.rowNumber,
          row,
          record,
          key: `${normalizeName(record.name)}|${normalizeName(record.country)}`,
          sourceRow: row.original,
          extraFields: extraFieldsOf(sheetInfo, row),
        });
      }
    }
  }

  // ---------- Duplicates within the file ----------

  const uniqueMasters = [];
  const firstByKey = new Map();

  for (const master of masterRecords) {
    const first = firstByKey.get(master.key);

    if (!first) {
      firstByKey.set(master.key, master);
      master.duplicateRows = [];
      uniqueMasters.push(master);
      continue;
    }

    const identical = JSON.stringify(first.record) === JSON.stringify(master.record);
    master.row.status = "duplicate";
    master.row.action = "Duplicate in file";

    addIssue({
      severity: "WARNING",
      sheet: master.sheet,
      row: master.rowNumber,
      column: "University",
      code: identical ? "duplicate_row" : "duplicate_university",
      message: identical
        ? `Exact duplicate of ${first.sheet} row ${first.rowNumber}; skipped.`
        : `Same university as ${first.sheet} row ${first.rowNumber} with different values. The first row is imported; this row is preserved on the university as a duplicate row.`,
      value: master.record.name,
      suggestion: identical ? "Delete the duplicate row." : "Merge the rows into one.",
    });

    if (!identical) {
      first.duplicateRows.push({ sheet: master.sheet, rowNumber: master.rowNumber, ...master.sourceRow });
    }
  }

  // Similar names in the file that are kept separate (reported, not merged).
  // Each name is compared against the alias keys of the *other* rows.
  const aliasIndex = new Map();
  const aliasKeys = (name) => {
    const { full, base, parens } = nameParts(name);
    return [full, base, ...parens, swappedName(full), swappedName(base)].filter(Boolean);
  };

  for (const master of uniqueMasters) {
    for (const key of aliasKeys(master.record.name)) {
      if (!aliasIndex.has(key)) aliasIndex.set(key, new Set());
      aliasIndex.get(key).add(master.key);
    }
  }

  for (const master of uniqueMasters) {
    const { full, base } = nameParts(master.record.name);
    const similar = new Set();

    [full, base, swappedName(full), swappedName(base)]
      .filter(Boolean)
      .forEach((key) => aliasIndex.get(key)?.forEach((other) => other !== master.key && similar.add(other)));

    for (const otherKey of similar) {
      const other = firstByKey.get(otherKey);
      if (normalizeName(other.record.country) !== normalizeName(master.record.country)) continue;

      addIssue({
        severity: "WARNING",
        sheet: master.sheet,
        row: master.rowNumber,
        column: "University",
        code: "similar_name",
        message: `"${master.record.name}" may be the same university as "${other.record.name}" (${other.sheet} row ${other.rowNumber}). Both are kept as separate universities.`,
        value: master.record.name,
        suggestion: "Use one consistent name if they are the same university.",
      });
    }
  }

  // ---------- Existing universities in MongoDB ----------

  const existingUniversities = await University.find({}, { _id: 1, id: 1, name: 1, country: 1, city: 1 }).lean();

  const matchersByCountry = new Map();
  for (const university of existingUniversities) {
    const countryKey = normalizeName(university.country);
    if (!matchersByCountry.has(countryKey)) matchersByCountry.set(countryKey, []);
    matchersByCountry.get(countryKey).push({ key: String(university._id), name: university.name });
  }
  for (const [countryKey, groups] of matchersByCountry) {
    matchersByCountry.set(countryKey, createNameMatcher(groups));
  }

  const existingById = new Map(existingUniversities.map((university) => [String(university._id), university]));

  // Planned writes, keyed by entity: "db:<_id>" or "file:<name|country>"
  const entities = new Map();

  for (const master of uniqueMasters) {
    const matcher = matchersByCountry.get(normalizeName(master.record.country));
    const result = matcher ? matcher(master.record.name) : { reason: "No matching university" };

    if (result.ambiguous) {
      master.row.status = "invalid";
      addIssue({
        severity: "ERROR",
        sheet: master.sheet,
        row: master.rowNumber,
        column: "University",
        code: "ambiguous_existing",
        message: `Matches more than one existing university (${result.reason.replace("Ambiguous: matches ", "")}).`,
        value: master.record.name,
        suggestion: "Use the exact name of the existing university.",
      });
      continue;
    }

    const existing = result.groupKey ? existingById.get(result.groupKey) : undefined;
    const entityKey = existing ? `db:${existing._id}` : `file:${master.key}`;

    master.entityKey = entityKey;

    entities.set(entityKey, {
      entityKey,
      kind: existing ? "existing" : "new",
      existing,
      master,
      linked: {
        website: undefined,
        ranking: undefined,
        rankingSource: undefined,
        admissionDifficulty: [],
        linkedSheetRows: [],
      },
    });

    if (existing) {
      master.row.action = mode === "update" ? "Update existing" : "Skip (already exists)";
      if (mode !== "update") master.row.status = "skipped";

      addIssue({
        severity: "INFO",
        sheet: master.sheet,
        row: master.rowNumber,
        column: "University",
        code: "already_exists",
        message: `Already exists as "${existing.name}" (${existing.id || existing._id}). ${mode === "update" ? "It will be updated with the non-empty values from this row." : "Skipped; choose \"Update existing\" to overwrite."}`,
        value: master.record.name,
      });
    } else {
      master.row.action = "Create";
    }
  }

  // ======================================================
  // COURSE ROWS (one course per row, linked to a university)
  //
  // The university is matched against university sheets in this file and the
  // database; one that exists in neither is created from the row's
  // University / Country / City. Existing courses (same university, course
  // name and degree) follow the same skip / update choice as universities.
  // ======================================================

  const courseItems = [];
  const courseCreates = [];
  const courseUpdates = [];
  const courseSkips = [];
  let courseDuplicates = 0;

  // Existing universities that courses link to without being on a university sheet
  const linkedUniversities = new Map();

  const courseSheets = sheets.filter((sheet) => sheet.type === "courses");

  if (courseSheets.length) {
    const universityGroups = [];

    for (const entity of entities.values()) {
      universityGroups.push({ key: entity.entityKey, name: entity.master.record.name, country: entity.master.record.country });
      if (entity.existing) universityGroups.push({ key: entity.entityKey, name: entity.existing.name, country: entity.existing.country });
    }
    for (const university of existingUniversities) {
      const key = `db:${university._id}`;
      if (!entities.has(key)) universityGroups.push({ key, name: university.name, country: university.country });
    }

    const matchers = new Map();
    const universityMatcher = (country) => {
      const countryKey = country ? normalizeName(country) : "";
      if (!matchers.has(countryKey)) {
        matchers.set(
          countryKey,
          createNameMatcher(universityGroups.filter((group) => !countryKey || normalizeName(group.country) === countryKey)),
        );
      }
      return matchers.get(countryKey);
    };

    for (const sheetInfo of courseSheets) {
      for (const row of sheetInfo.rows) {
        if (row.status === "header") continue;
        await rowValidated();

        if (sheetInfo.blocked) {
          row.status = "invalid";
          continue;
        }

        const rowIssues = [];
        const issue = (key, severity, code, message, suggestion = "", value) => {
          rowIssues.push(severity);
          addIssue({
            severity,
            sheet: sheetInfo.name,
            row: row.rowNumber,
            column: key ? headerOf(sheetInfo, key) : "",
            code,
            message,
            value: value ?? (key ? cellOf(sheetInfo, row, key)?.text ?? "" : ""),
            suggestion,
          });
        };

        const cell = (key) => cellOf(sheetInfo, row, key);
        const text = (key) => cell(key)?.text ?? "";
        const isTextCell = (key) => !["n", "b"].includes(cell(key)?.type);

        // ---------- University and course name ----------

        const universityName = text("name");

        if (!universityName) {
          issue("name", "ERROR", "missing_name", "University name is missing.", "Enter the university of this course or delete the row.");
        } else if (!isTextCell("name")) {
          issue("name", "ERROR", "invalid_type", "University name must be text, not a number or TRUE/FALSE.");
        } else if (universityName.length < 3 || universityName.length > 200) {
          issue("name", "ERROR", "invalid_name", "University name must be between 3 and 200 characters.");
        }

        const courseName = text("courseName");

        if (!courseName) {
          issue("courseName", "ERROR", "missing_course", "Course name is missing.", "Enter the course name or delete the row.");
        } else if (!isTextCell("courseName")) {
          issue("courseName", "ERROR", "invalid_type", "Course name must be text, not a number or TRUE/FALSE.");
        } else if (courseName.length < 2 || courseName.length > 300) {
          issue("courseName", "ERROR", "invalid_course_name", "Course name must be between 2 and 300 characters.");
        }

        let country = text("country");

        if (country && (!isTextCell("country") || /\d/.test(country))) {
          issue("country", "ERROR", "invalid_country", "Country must be a country name.", "Enter the country name, e.g. \"Germany\".");
          country = "";
        }

        // ---------- Course fields ----------

        const record = { courseName };

        for (const [key, field] of Object.entries(COURSE_FIELDS)) {
          if (key === "courseName") continue;

          const value = text(key);
          if (!value) continue;

          switch (key) {
            case "link":
              if (isValidUrl(value)) record.sourceUrl = value;
              else issue(key, "WARNING", "invalid_url", "Link is not a valid URL; it is not stored on the course (kept in the original row).", /^www\./i.test(value) ? `Use "https://${value}".` : "Use a full URL starting with https://.");
              break;

            case "annualTuitionFee": {
              record.annualTuitionFee = value;
              const amount = parseTuitionAmount(value);
              if (amount.warning) issue(key, "WARNING", amount.code, amount.warning, amount.suggestion);
              if (amount.min !== undefined) {
                Object.assign(record, { tuitionMin: amount.min, tuitionMax: amount.max, tuitionPeriod: "year", tuitionCurrency: "EUR" });
              }
              break;
            }

            case "tuitionFee":
              record.tuitionFee = value;
              break;

            case "englishRequirement":
            case "toefl": {
              const max = key === "toefl" ? 120 : 9;
              const number = Number(value);
              if (cell(key).type === "n" && (number < 0 || number > max)) {
                issue(key, "ERROR", `${key === "toefl" ? "toefl" : "ielts"}_range`, `${key === "toefl" ? "TOEFL" : "IELTS"} must be between 0 and ${max}.`);
              } else {
                record[field] = value;
              }
              break;
            }

            case "requirements":
              record.requirements = value.split(";").map(clean).filter(Boolean);
              break;

            case "popularCourses":
              record.majorCourses = splitList(value);
              break;

            case "applicationOpens":
            case "applicationDeadline": {
              const dateCell = cell(key);
              if (dateCell.isDate) {
                record[field] = isoDate(dateCell) ?? value;
                break;
              }
              const check = validateDateText(value);
              if (!check.ok) {
                issue(key, check.severity, "invalid_date", check.message, check.suggestion);
                if (check.severity === "ERROR") break;
              }
              record[field] = value;
              break;
            }

            case "recommendedIndianPercentage": {
              const numbers = extractNumbers(value);
              if (numbers.some((number) => number > 100)) {
                issue(key, "ERROR", "percentage_range", "Percentage must be between 0 and 100.");
              } else if (numbers.length >= 2 && numbers[0] > numbers[1] && /\d\s*[-–]\s*\d/.test(value)) {
                issue(key, "ERROR", "percentage_range", "Percentage range is reversed.", `Use "${numbers[1]}-${numbers[0]}%".`);
              } else {
                record.recommendedIndianPercentage = value;
              }
              break;
            }

            case "level": {
              const level = COURSE_DIFFICULTIES.find((item) => item.toLowerCase() === value.toLowerCase().replace(/\s+/g, " "));
              if (level) record.difficulty = level;
              else issue(key, "WARNING", "unsupported_difficulty", `Difficulty "${value}" is not one of ${COURSE_DIFFICULTIES.join(", ")}; it is not stored as the course difficulty (kept in the original row).`, `Use one of: ${COURSE_DIFFICULTIES.join(", ")}.`);
              break;
            }

            default:
              record[field] = value;
          }
        }

        let website;
        if (text("website")) {
          if (isValidUrl(text("website"))) website = text("website");
          else issue("website", "WARNING", "invalid_url", "Website is not a valid URL; it is not stored (kept in the original row).", "Use a full URL starting with https://.");
        }

        const customValues = customValuesOf(sheetInfo, row, issue);
        if (customValues) record.customFields = customValues;

        if (rowIssues.includes("ERROR")) {
          row.status = "invalid";
          continue;
        }

        // ---------- University link ----------

        const countryName = country || defaultCountry;
        const result = universityMatcher(countryName)(universityName);

        if (result.ambiguous) {
          issue("name", "ERROR", "ambiguous_university", `Cannot be linked safely: ${result.reason.replace("Ambiguous: ", "")}.`, "Use the exact university name (and fill in the Country).");
          row.status = "invalid";
          continue;
        }

        let entity;

        if (result.groupKey) {
          entity = entities.get(result.groupKey);

          if (!entity) {
            if (!linkedUniversities.has(result.groupKey)) {
              linkedUniversities.set(result.groupKey, {
                entityKey: result.groupKey,
                kind: "existing",
                existing: existingById.get(result.groupKey.slice(3)),
                sheet: sheetInfo.name,
                rowNumber: row.rowNumber,
              });
            }
            entity = linkedUniversities.get(result.groupKey);
          }
        } else {
          if (!countryName) {
            issue("country", "ERROR", "missing_country", `"${universityName}" does not exist yet and cannot be created without a country.`, "Fill in the Country cell or set a default country before scanning.");
            row.status = "invalid";
            continue;
          }

          const key = `file:${normalizeName(universityName)}|${normalizeName(countryName)}`;
          entity = entities.get(key);

          if (!entity) {
            const universityRecord = { name: universityName, country: countryName };
            if (text("city")) universityRecord.city = text("city");
            if (website) universityRecord.website = website;

            entity = {
              entityKey: key,
              kind: "new",
              existing: undefined,
              master: {
                sheet: sheetInfo.name,
                rowNumber: row.rowNumber,
                record: universityRecord,
                key,
                fromCourses: true,
                duplicateRows: [],
              },
              linked: { website: undefined, ranking: undefined, rankingSource: undefined, admissionDifficulty: [], linkedSheetRows: [] },
            };
            entities.set(key, entity);

            if (!country) {
              addIssue({
                severity: "INFO",
                sheet: sheetInfo.name,
                row: row.rowNumber,
                column: "Country",
                code: "default_country",
                message: `Country is empty; default "${defaultCountry}" used for the new university "${universityName}".`,
              });
            }
          }
        }

        courseItems.push({
          sheet: sheetInfo.name,
          rowNumber: row.rowNumber,
          row,
          record,
          entity,
          key: `${entity.entityKey}|${normalizeName(courseName)}|${normalizeName(record.degree ?? "")}`,
          sourceRow: row.original,
          extraFields: extraFieldsOf(sheetInfo, row),
        });
      }
    }

    // ---------- Existing courses of the linked universities ----------

    const existingOwners = new Map();
    for (const item of courseItems) {
      if (item.entity.existing) existingOwners.set(String(item.entity.existing._id), item.entity);
    }

    const externalOwners = new Map(
      [...existingOwners.values()].filter((entity) => entity.existing.id).map((entity) => [entity.existing.id, entity.entityKey]),
    );

    const existingCourses = existingOwners.size
      ? await UniversityCourse.find(
          {
            $or: [
              { universityId: { $in: [...existingOwners.values()].map((entity) => entity.existing._id) } },
              { universityExternalId: { $in: [...externalOwners.keys()] } },
            ],
          },
          { _id: 1, id: 1, universityId: 1, universityExternalId: 1, courseName: 1, degree: 1 },
        ).lean()
      : [];

    const existingCourseByKey = new Map();
    for (const course of existingCourses) {
      const owner = course.universityId && existingOwners.has(String(course.universityId))
        ? `db:${course.universityId}`
        : externalOwners.get(course.universityExternalId);
      const key = owner && `${owner}|${normalizeName(course.courseName)}|${normalizeName(course.degree ?? "")}`;
      if (key && !existingCourseByKey.has(key)) existingCourseByKey.set(key, course);
    }

    // ---------- Duplicates in the file, then existing courses ----------

    const firstByCourse = new Map();

    for (const item of courseItems) {
      const universityLabel = item.entity.existing?.name ?? item.entity.master?.record.name;
      const first = firstByCourse.get(item.key);

      if (first) {
        const identical = JSON.stringify(first.record) === JSON.stringify(item.record);
        item.row.status = "duplicate";
        item.row.action = "Duplicate in file";
        courseDuplicates++;

        addIssue({
          severity: "WARNING",
          sheet: item.sheet,
          row: item.rowNumber,
          column: headerOf(sheets.find((sheet) => sheet.name === item.sheet), "courseName"),
          code: identical ? "duplicate_row" : "duplicate_course",
          message: identical
            ? `Exact duplicate of ${first.sheet} row ${first.rowNumber}; skipped.`
            : `Same course (university, name and degree) as ${first.sheet} row ${first.rowNumber} with different values. The first row is imported; this row is kept in the import log.`,
          value: item.record.courseName,
          suggestion: identical ? "Delete the duplicate row." : "Merge the rows into one, or give the courses different degrees.",
        });
        continue;
      }

      firstByCourse.set(item.key, item);

      const existing = existingCourseByKey.get(item.key);

      if (existing) {
        item.existingCourse = existing;

        if (mode === "update") {
          item.row.status = "valid";
          item.row.action = `Update existing course (${existing.id || existing._id})`;
          courseUpdates.push(item);
        } else {
          item.row.status = "skipped";
          item.row.action = "Skip (course already exists)";
          courseSkips.push(item);
        }

        addIssue({
          severity: "INFO",
          sheet: item.sheet,
          row: item.rowNumber,
          column: headerOf(sheets.find((sheet) => sheet.name === item.sheet), "courseName"),
          code: "course_exists",
          message: `"${item.record.courseName}" already exists at "${universityLabel}" (${existing.id || existing._id}). ${mode === "update" ? "It will be updated with the non-empty values from this row." : "Skipped; choose \"Update existing\" to overwrite."}`,
          value: item.record.courseName,
        });
        continue;
      }

      item.row.status = "valid";
      item.row.action = item.entity.kind === "existing"
        ? `Create at existing "${universityLabel}"`
        : item.entity.master.fromCourses
          ? `Create (with new university "${universityLabel}")`
          : `Create at "${universityLabel}" (new in this file)`;
      courseCreates.push(item);
    }

  }

  // ======================================================
  // RELATED SHEETS (rankings, websites, admission difficulty)
  // ======================================================

  const linkGroups = [];
  for (const entity of entities.values()) {
    linkGroups.push({ key: entity.entityKey, name: entity.master.record.name });
    if (entity.existing) linkGroups.push({ key: entity.entityKey, name: entity.existing.name });
  }
  for (const university of existingUniversities) {
    const key = `db:${university._id}`;
    if (!entities.has(key)) linkGroups.push({ key, name: university.name });
  }

  const linkMatcher = createNameMatcher(linkGroups);
  const linkedOnlyExisting = new Map();

  const entityFor = (key) => {
    if (entities.has(key)) return entities.get(key);

    if (!linkedOnlyExisting.has(key)) {
      const existing = existingById.get(key.slice(3));
      linkedOnlyExisting.set(key, {
        entityKey: key,
        kind: "existing",
        existing,
        master: undefined,
        linked: { website: undefined, ranking: undefined, rankingSource: undefined, admissionDifficulty: [], linkedSheetRows: [] },
      });
    }

    return linkedOnlyExisting.get(key);
  };

  for (const sheetInfo of sheets.filter((sheet) => ["rankings", "websites", "admissionDifficulty"].includes(sheet.type))) {
    const rankHeader = headerOf(sheetInfo, "rank");
    const rankingSourceFromHeader = rankHeader?.match(/\(([^)]*)\)/)?.[1];

    for (const row of sheetInfo.rows) {
      if (row.status === "header") continue;
      await rowValidated();

      if (sheetInfo.blocked) {
        row.status = "invalid";
        continue;
      }

      const rowIssues = [];
      const issue = (key, severity, code, message, suggestion = "") => {
        rowIssues.push(severity);
        addIssue({
          severity,
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: key ? headerOf(sheetInfo, key) : "",
          code,
          message,
          value: key ? cellOf(sheetInfo, row, key)?.text ?? "" : "",
          suggestion,
        });
      };

      const text = (key) => cellOf(sheetInfo, row, key)?.text ?? "";
      const name = text("name");
      const values = {};

      if (!name) {
        issue("name", "ERROR", "missing_name", "University name is missing.", "Enter the university name or delete the row.");
      }

      if (sheetInfo.type === "rankings") {
        const rank = text("rank").replace(/^[=#]/, "");
        if (!rank) {
          issue("rank", "ERROR", "missing_rank", "Rank is empty.");
        } else if (!/^\d+(\s*[-–]\s*\d+)?\+?$/.test(rank)) {
          issue("rank", "ERROR", "invalid_rank", "Rank must be a whole number or a range such as 201-250.");
        } else {
          values.ranking = rank;
          values.rankingSource = text("rankingSource") || rankingSourceFromHeader || undefined;
        }
      }

      if (sheetInfo.type === "rankings" || sheetInfo.type === "websites") {
        const website = text("website");
        if (website) {
          if (isValidUrl(website)) {
            values.website = website;
          } else {
            issue("website", sheetInfo.type === "websites" ? "ERROR" : "WARNING", "invalid_url", "Website is not a valid URL.", /^www\./i.test(website) ? `Use "https://${website}".` : "Use a full URL starting with https://.");
          }
        } else if (sheetInfo.type === "websites") {
          issue("website", "ERROR", "missing_website", "Official Website is empty.");
        }
      }

      if (sheetInfo.type === "admissionDifficulty") {
        const field = text("field");
        const levelText = text("level");
        const level = DIFFICULTY_LEVELS.find((item) => item.toLowerCase() === levelText.toLowerCase());

        if (!field) issue("field", "ERROR", "missing_field", "Field is empty.");
        if (!levelText) {
          issue("level", "ERROR", "missing_level", "Level is empty.");
        } else if (!level) {
          issue("level", "ERROR", "unsupported_level", `Unsupported level "${levelText}".`, `Use one of: ${DIFFICULTY_LEVELS.join(", ")}.`);
        }

        if (field && level) {
          values.admissionDifficulty = { field, level, sourceName: name, sheet: sheetInfo.name, rowNumber: row.rowNumber };
        }
      }

      if (rowIssues.includes("ERROR")) {
        row.status = "invalid";
        continue;
      }

      const result = linkMatcher(name);

      if (!result.groupKey) {
        row.status = "unlinked";
        row.action = "Not linked";
        addIssue({
          severity: "WARNING",
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: headerOf(sheetInfo, "name"),
          code: result.ambiguous ? "ambiguous_link" : "unlinked",
          message: result.ambiguous
            ? `Cannot be linked safely: ${result.reason.replace("Ambiguous: ", "")}. Not imported (preserved in the import log).`
            : "No university with this name in this file or the database. Not imported (preserved in the import log).",
          value: name,
          suggestion: "Add the university to a University data sheet or use its exact name.",
        });
        continue;
      }

      const entity = entityFor(result.groupKey);
      const linked = entity.linked;
      const targetName = entity.master?.record.name ?? entity.existing?.name;

      const conflict = (label, current, incoming) => {
        addIssue({
          severity: "WARNING",
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: label,
          code: "conflicting_value",
          message: `${label} for "${targetName}" is already set to "${current}" by another row; "${incoming}" is ignored.`,
          value: incoming,
        });
      };

      if (values.website) {
        const current = linked.website ?? entity.master?.record.website;
        if (current && current !== values.website) conflict("Official Website", current, values.website);
        else linked.website = values.website;
      }

      if (values.ranking) {
        if (linked.ranking && linked.ranking !== values.ranking) conflict("Rank", linked.ranking, values.ranking);
        else {
          linked.ranking = values.ranking;
          linked.rankingSource = values.rankingSource;
        }
      }

      if (values.admissionDifficulty) {
        const current = linked.admissionDifficulty.find((entry) => entry.field === values.admissionDifficulty.field);
        if (current && current.level !== values.admissionDifficulty.level) conflict("Level", current.level, values.admissionDifficulty.level);
        else if (!current) linked.admissionDifficulty.push(values.admissionDifficulty);
      }

      linked.linkedSheetRows.push({ sheet: sheetInfo.name, rowNumber: row.rowNumber, sourceName: name, data: row.original });

      if (entity.kind === "existing" && mode !== "update") {
        row.status = "skipped";
        row.action = `Skip (links to existing "${targetName}")`;
      } else {
        row.status = "valid";
        row.action = entity.kind === "existing" ? `Update existing "${targetName}"` : `Link to "${targetName}"`;
      }
    }
  }

  // Rows on sheets that are not imported
  for (const sheetInfo of sheets) {
    if (["unrecognized", "instructions", "empty"].includes(sheetInfo.type)) {
      sheetInfo.rows.forEach((row) => {
        if (row.status !== "header") {
          row.status = "ignored";
          row.action = sheetInfo.type === "instructions" ? "Instructions" : "Preserved only";
        }
      });
    }
  }

  // ---------- Plan ----------

  report({ phase: "checking", totalRows: rowsToValidate, processedRows: rowsToValidate });

  const allEntities = [...entities.values(), ...linkedOnlyExisting.values()];

  const creates = allEntities.filter((entity) => entity.kind === "new");
  const updates = mode === "update"
    ? allEntities.filter((entity) => entity.kind === "existing" && entity.existing)
    : [];
  const skippedExisting = mode === "update"
    ? []
    : allEntities.filter((entity) => entity.kind === "existing" && entity.existing);

  const hasFatal = issues.some(
    (issue) => issue.severity === "ERROR" && !issue.row && ["too_many_sheets", ...MAPPING_ERROR_CODES].includes(issue.code),
  );

  // ---------- Summary ----------

  const dataRows = sheets.flatMap((sheet) => sheet.rows.filter((row) => row.status !== "header").map((row) => ({ ...row, sheetType: sheet.type })));
  const importableSheetRows = dataRows.filter((row) => !["ignored"].includes(row.status));

  const count = (severity) => issues.filter((issue) => issue.severity === severity).length;

  const summary = {
    sheetsScanned: sheets.length,
    rowsScanned: dataRows.length,
    totalColumns: sheets.reduce((total, sheet) => total + sheet.columnCount, 0),
    validRows: importableSheetRows.filter((row) => row.status === "valid").length,
    invalidRows: importableSheetRows.filter((row) => row.status === "invalid").length,
    skippedRows: importableSheetRows.filter((row) => row.status === "skipped").length,
    duplicateRows: importableSheetRows.filter((row) => row.status === "duplicate").length,
    unlinkedRows: importableSheetRows.filter((row) => row.status === "unlinked").length,
    ignoredRows: dataRows.filter((row) => row.status === "ignored").length,
    universities: {
      new: creates.length,
      alreadyExists: entities.size - creates.length,
      duplicateInFile: masterRecords.length - uniqueMasters.length,
      invalid: sheets
        .filter((sheet) => sheet.type === "universities")
        .flatMap((sheet) => sheet.rows)
        .filter((row) => row.status === "invalid").length,
      linkedExistingOnly: linkedOnlyExisting.size,
      linkedByCourses: linkedUniversities.size,
    },
    courses: {
      new: courseCreates.length,
      alreadyExists: courseUpdates.length + courseSkips.length,
      duplicateInFile: courseDuplicates,
      invalid: courseSheets.flatMap((sheet) => sheet.rows).filter((row) => row.status === "invalid").length,
    },
    willCreate: creates.length,
    willUpdate: updates.length,
    willSkip: skippedExisting.length,
    willCreateCourses: courseCreates.length,
    willUpdateCourses: courseUpdates.length,
    willSkipCourses: courseSkips.length,
    errors: count("ERROR"),
    warnings: count("WARNING"),
    infos: count("INFO"),
  };

  const importRowCount = importableSheetRows.filter((row) => row.status === "valid").length;

  const preview = {
    fileName,
    fileSize: buffer.length,
    sha256,
    sheetCount: sheets.length,
    sheetNames: sheets.map((sheet) => sheet.name),
    options: { mode, defaultCountry },
    canImport: !hasFatal && creates.length + updates.length + courseCreates.length + courseUpdates.length > 0,
    // What the workbook holds, from its sheet structure
    detected: {
      // Course rows name their university, so a course sheet holds university data too
      universities: sheets.some((sheet) => sheet.type === "universities") || courseSheets.length > 0,
      courses: courseSheets.length > 0,
    },
    importRowCount,
    summary,
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      type: sheet.type,
      purpose: sheet.purpose,
      headerRowNumber: sheet.headerRowNumber,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      columns: sheet.columns.map(({ index, header, status, mappedTo, mappedHeader, suggestion, suggestionField, autoField, selected, confidence, matchReason, candidates }) => ({
        index,
        header,
        status,
        ...(mappedTo ? { mappedTo, mappedHeader } : {}),
        ...(suggestion ? { suggestion, suggestionField } : {}),
        ...(autoField ? { autoField } : {}),
        ...(selected ? { selected: true } : {}),
        ...(confidence ? { confidence, matchReason } : {}),
        ...(candidates ? { candidates } : {}),
        samples: sheet.samples?.[index] ?? [],
      })),
      validRows: sheet.rows.filter((row) => row.status === "valid").length,
      invalidRows: sheet.rows.filter((row) => row.status === "invalid").length,
      truncated: sheet.rows.length > LIMITS.previewRowsPerSheet,
      rows: sheet.rows.slice(0, LIMITS.previewRowsPerSheet).map((row) => ({
        rowNumber: row.rowNumber,
        cells: row.texts,
        status: row.status,
        action: row.action,
      })),
    })),
    issues: issues.slice(0, LIMITS.maxIssuesReturned),
    issuesTruncated: issues.length > LIMITS.maxIssuesReturned,
    fields: [
      ...IMPORT_FIELDS,
      ...[...customCatalog.university.values(), ...customCatalog.course.values()].map((definition) => {
        const sheetType = definition.entity === "course" ? "courses" : "universities";
        const model = definition.entity === "course" ? "UniversityCourse" : "University";
        return {
          key: `${CUSTOM_PREFIX}${definition.key}`,
          label: definition.label,
          dbField: `customFields.${definition.key}`,
          dbFields: { [sheetType]: `${model}.customFields.${definition.key}` },
          description: `Custom ${definition.type} field${definition.isNew ? " (created by this import)" : ""}`,
          sheetTypes: [sheetType],
          custom: { entity: definition.entity, type: definition.type, isNew: definition.isNew },
        };
      }),
    ],
    // Fields this import will create (after confirmation)
    newCustomFields: [...customCatalog.university.values(), ...customCatalog.course.values()].filter((definition) => definition.isNew).map(({ entity, key, label, type }) => ({ entity, key, label, type })),
    customFieldTypes: CUSTOM_FIELD_TYPES,
    customFieldCreation: creationEnabled(),
    hasColumnSelections: Boolean(selections),
    mappingErrors: issues.filter((issue) => MAPPING_ERROR_CODES.includes(issue.code)).length,
    universities: [
      ...creates.map((entity) => ({
        name: entity.master.record.name,
        country: entity.master.record.country,
        city: entity.master.record.city ?? "",
        action: "create",
        sheet: entity.master.sheet,
        rowNumber: entity.master.rowNumber,
      })),
      ...allEntities
        .filter((entity) => entity.kind === "existing" && entity.existing)
        .map((entity) => ({
          name: entity.existing.name,
          country: entity.existing.country,
          city: entity.existing.city ?? "",
          action: mode === "update" ? "update" : "skip",
          existingId: entity.existing.id || String(entity.existing._id),
          sheet: entity.master?.sheet ?? entity.linked.linkedSheetRows[0]?.sheet ?? "",
          rowNumber: entity.master?.rowNumber ?? entity.linked.linkedSheetRows[0]?.rowNumber ?? null,
        })),
      ...[...linkedUniversities.values()]
        .filter((entity) => !allEntities.some((other) => other.entityKey === entity.entityKey))
        .map((entity) => ({
          name: entity.existing.name,
          country: entity.existing.country,
          city: entity.existing.city ?? "",
          action: "link",
          existingId: entity.existing.id || String(entity.existing._id),
          sheet: entity.sheet,
          rowNumber: entity.rowNumber,
        })),
    ],
    courses: [...courseCreates, ...courseUpdates, ...courseSkips].slice(0, LIMITS.previewRowsPerSheet).map((item) => ({
      courseName: item.record.courseName,
      degree: item.record.degree ?? "",
      universityName: item.entity.existing?.name ?? item.entity.master.record.name,
      action: item.existingCourse ? (mode === "update" ? "update" : "skip") : "create",
      existingId: item.existingCourse ? item.existingCourse.id || String(item.existingCourse._id) : undefined,
      sheet: item.sheet,
      rowNumber: item.rowNumber,
    })),
    coursesTruncated: courseCreates.length + courseUpdates.length + courseSkips.length > LIMITS.previewRowsPerSheet,
  };

  return {
    preview,
    plan: { creates, updates, courseCreates, courseUpdates, newCustomFields: [...customCatalog.university.values(), ...customCatalog.course.values()].filter((definition) => definition.isNew), issues, sheets, summary, fileName, sha256, fileSize: buffer.length, mode, defaultCountry },
  };
}

// ======================================================
// IMPORT (WRITES)
// ======================================================

const isTransactionUnsupported = (error) =>
  error?.code === 20 ||
  // Standalone mongod: transactions need retryable writes, which it also lacks
  /Transaction numbers are only allowed|replica set|does not support transactions|does not support retryable writes/i.test(error?.message ?? "");

function buildPreservedRows(plan) {
  const preserved = [];

  for (const sheet of plan.sheets) {
    if (sheet.type === "instructions" || sheet.type === "empty") continue;

    const rows = sheet.rows.filter((row) =>
      ["ignored", "unlinked", "invalid", "duplicate", "skipped"].includes(row.status),
    );

    if (rows.length === 0) continue;

    preserved.push({
      sheet: sheet.name,
      sheetType: sheet.type,
      headers: sheet.headers,
      headerRowNumber: sheet.headerRowNumber,
      rows: rows.map((row) => ({ rowNumber: row.rowNumber, status: row.status, cells: row.texts })),
    });
  }

  // Keep the audit document well below MongoDB's 16 MB limit
  let size = JSON.stringify(preserved).length;
  while (size > 10 * 1024 * 1024 && preserved.length) {
    const largest = preserved.reduce((a, b) => (a.rows.length >= b.rows.length ? a : b));
    largest.rows = largest.rows.slice(0, Math.floor(largest.rows.length / 2));
    largest.truncated = true;
    size = JSON.stringify(preserved).length;
  }

  return preserved;
}

const WRITABLE_MASTER_FIELDS = [
  "name",
  "country",
  "city",
  "annualTuitionFee",
  "tuitionFeeMin",
  "tuitionFeeMax",
  "englishRequirement",
  "requirements",
  "applicationOpens",
  "applicationDeadline",
  "popularCourses",
  "recommendedIndianPercentage",
  "website",
  "customFields",
];

const hasValue = (value) =>
  value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);

async function executeImport(plan, { onProgress } = {}) {
  const report = typeof onProgress === "function" ? onProgress : () => {};
  const importId = `IMP-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const importedAt = new Date();

  const importSource = (sheet, rowNumber) => ({
    fileName: plan.fileName,
    sheet,
    rowNumber,
    importId,
    importedAt,
  });

  // ---------- New universities ----------

  const stamp = Date.now();
  const createdByEntity = new Map();

  const createDocs = plan.creates.map((entity, index) => {
    const { master, linked } = entity;
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      id: `UNI-${stamp}-${String(index + 1).padStart(3, "0")}`,
    };

    for (const key of WRITABLE_MASTER_FIELDS) {
      if (hasValue(master.record[key])) doc[key] = master.record[key];
    }

    if (!doc.website && linked.website) doc.website = linked.website;
    if (linked.ranking) doc.ranking = linked.ranking;
    if (linked.rankingSource) doc.rankingSource = linked.rankingSource;
    if (linked.admissionDifficulty.length) doc.admissionDifficulty = linked.admissionDifficulty;
    if (linked.linkedSheetRows.length) doc.linkedSheetRows = linked.linkedSheetRows;

    doc.importSource = importSource(master.sheet, master.rowNumber);
    doc.sourceRow = master.sourceRow;
    if (master.extraFields) doc.extraFields = master.extraFields;
    if (master.duplicateRows.length) doc.duplicateSourceRows = master.duplicateRows;

    createdByEntity.set(entity.entityKey, doc);
    return doc;
  });

  // ---------- Updates (only non-empty incoming values; nothing is unset) ----------

  const existingIds = plan.updates.map((entity) => entity.existing._id);
  const snapshots = await University.find({ _id: { $in: existingIds } }).lean();
  const snapshotById = new Map(snapshots.map((doc) => [String(doc._id), doc]));

  const updateOps = plan.updates.map((entity) => {
    const current = snapshotById.get(String(entity.existing._id)) ?? {};
    const { master, linked } = entity;
    const $set = {};

    if (master) {
      for (const key of WRITABLE_MASTER_FIELDS) {
        // Keep the existing name so the record identity does not change
        if (key === "name") continue;
        // Custom values are merged key by key; other custom fields are kept
        if (key === "customFields") {
          for (const [field, value] of Object.entries(master.record.customFields ?? {})) $set[`customFields.${field}`] = value;
          continue;
        }
        if (hasValue(master.record[key])) $set[key] = master.record[key];
      }
      $set.sourceRow = master.sourceRow;
      if (master.extraFields) $set.extraFields = { ...(current.extraFields ?? {}), ...master.extraFields };
      if (master.duplicateRows.length) $set.duplicateSourceRows = master.duplicateRows;
      $set.importSource = importSource(master.sheet, master.rowNumber);
    }

    if (linked.website && !$set.website) $set.website = linked.website;
    if (linked.ranking) {
      $set.ranking = linked.ranking;
      if (linked.rankingSource) $set.rankingSource = linked.rankingSource;
    }

    if (linked.admissionDifficulty.length) {
      const incomingFields = new Set(linked.admissionDifficulty.map((entry) => entry.field));
      $set.admissionDifficulty = [
        ...(current.admissionDifficulty ?? []).filter((entry) => !incomingFields.has(entry.field)),
        ...linked.admissionDifficulty,
      ];
    }

    if (linked.linkedSheetRows.length) {
      const seen = new Set(
        (current.linkedSheetRows ?? []).map((row) => `${row.sheet}|${row.rowNumber}|${row.sourceName}`),
      );
      $set.linkedSheetRows = [
        ...(current.linkedSheetRows ?? []),
        ...linked.linkedSheetRows.filter((row) => !seen.has(`${row.sheet}|${row.rowNumber}|${row.sourceName}`)),
      ];
    }

    if (!master) {
      const first = linked.linkedSheetRows[0];
      $set.importSource = importSource(first?.sheet ?? "", first?.rowNumber ?? null);
    }

    return { updateOne: { filter: { _id: entity.existing._id }, update: { $set } } };
  });

  // ---------- Courses (linked to new or existing universities) ----------

  const universityOf = (entity) => createdByEntity.get(entity.entityKey) ?? entity.existing;

  const courseDocs = plan.courseCreates.map((item, index) => {
    const university = universityOf(item.entity);
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      id: `UC-${stamp}-${String(index + 1).padStart(3, "0")}`,
      universityId: university._id,
      universityName: university.name,
    };

    if (university.id) doc.universityExternalId = university.id;

    for (const [key, value] of Object.entries(item.record)) {
      if (hasValue(value)) doc[key] = value;
    }

    doc.importId = importId;
    doc.importedAt = importedAt;
    doc.sourceRow = item.sourceRow;
    if (item.extraFields) doc.extraFields = item.extraFields;

    return doc;
  });

  const courseSnapshots = plan.courseUpdates.length
    ? await UniversityCourse.find({ _id: { $in: plan.courseUpdates.map((item) => item.existingCourse._id) } }).lean()
    : [];
  const courseSnapshotById = new Map(courseSnapshots.map((doc) => [String(doc._id), doc]));

  // Only non-empty incoming values; the course name and degree (its identity) are kept
  const courseUpdateOps = plan.courseUpdates.map((item) => {
    const current = courseSnapshotById.get(String(item.existingCourse._id)) ?? {};
    const $set = {};

    for (const [key, value] of Object.entries(item.record)) {
      if (key === "courseName" || key === "degree") continue;
      if (key === "customFields") {
        for (const [field, fieldValue] of Object.entries(value)) $set[`customFields.${field}`] = fieldValue;
        continue;
      }
      if (hasValue(value)) $set[key] = value;
    }

    $set.sourceRow = item.sourceRow;
    $set.importId = importId;
    $set.importedAt = importedAt;
    if (item.extraFields) $set.extraFields = { ...(current.extraFields ?? {}), ...item.extraFields };

    return { updateOne: { filter: { _id: item.existingCourse._id }, update: { $set } } };
  });

  // New custom field definitions (values are written with the records)
  const newDefinitions = (plan.newCustomFields ?? []).map(({ entity, key, label, type }) => ({
    entity,
    key,
    label,
    type,
    createdByImport: importId,
  }));

  const log = {
    importId,
    fileName: plan.fileName,
    fileSize: plan.fileSize,
    sha256: plan.sha256,
    options: {
      mode: plan.mode,
      defaultCountry: plan.defaultCountry,
      // Header -> field chosen in the preview (only when columns were selected/mapped)
      columnMapping: plan.sheets
        .filter((sheet) => sheet.columns.some((column) => column.selected))
        .map((sheet) => ({
          sheet: sheet.name,
          columns: sheet.columns.map((column) => ({
            header: column.header || `Column ${column.index + 1}`,
            included: column.status !== "excluded",
            field: column.status === "mapped" ? column.mappedTo : column.status === "excluded" ? null : EXTRA_FIELD,
          })),
        })),
    },
    summary: plan.summary,
    sheets: plan.sheets.map((sheet) => ({
      name: sheet.name,
      type: sheet.type,
      headerRowNumber: sheet.headerRowNumber,
      headers: sheet.headers,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
    })),
    issues: plan.issues.slice(0, 5000),
    preservedRows: buildPreservedRows(plan),
    createdUniversityIds: createDocs.map((doc) => doc.id),
    updatedUniversityIds: plan.updates.map((entity) => entity.existing.id || String(entity.existing._id)),
    createdCourseIds: courseDocs.map((doc) => doc.id),
    createdCustomFields: newDefinitions.map(({ entity, key, label, type }) => ({ entity, key, label, type })),
    updatedCourseIds: plan.courseUpdates.map((item) => item.existingCourse.id || String(item.existingCourse._id)),
  };

  report({
    phase: "writing",
    detail: [
      newDefinitions.length && `${newDefinitions.length} new field(s)`,
      createDocs.length + updateOps.length && `${createDocs.length + updateOps.length} universit${createDocs.length + updateOps.length === 1 ? "y" : "ies"}`,
      courseDocs.length + courseUpdateOps.length && `${courseDocs.length + courseUpdateOps.length} course(s)`,
    ].filter(Boolean).join(", "),
  });

  const write = async (session) => {
    if (newDefinitions.length) {
      await CustomFieldDefinition.insertMany(newDefinitions, { session, ordered: true });
    }
    if (createDocs.length) {
      await University.insertMany(createDocs, { session, ordered: true });
    }
    if (updateOps.length) {
      await University.bulkWrite(updateOps, { session, ordered: true });
    }
    if (courseDocs.length) {
      await UniversityCourse.insertMany(courseDocs, { session, ordered: true });
    }
    if (courseUpdateOps.length) {
      await UniversityCourse.bulkWrite(courseUpdateOps, { session, ordered: true });
    }
    await ExcelImport.create([log], { session });
  };

  let transactional = true;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(() => write(session));
  } catch (error) {
    if (!isTransactionUnsupported(error)) {
      throw new ImportError(`Import failed and was rolled back; no changes were saved. (${error.message})`, 500);
    }

    // Standalone MongoDB without transactions: write, and undo on failure
    transactional = false;

    try {
      await write(undefined);
    } catch (writeError) {
      await University.deleteMany({ _id: { $in: createDocs.map((doc) => doc._id) } });
      for (const snapshot of snapshots) {
        await University.replaceOne({ _id: snapshot._id }, snapshot);
      }
      await UniversityCourse.deleteMany({ _id: { $in: courseDocs.map((doc) => doc._id) } });
      await CustomFieldDefinition.deleteMany({ createdByImport: importId });
      for (const snapshot of courseSnapshots) {
        await UniversityCourse.replaceOne({ _id: snapshot._id }, snapshot);
      }
      await ExcelImport.deleteOne({ importId });

      throw new ImportError(`Import failed and all changes were reverted. (${writeError.message})`, 500);
    }
  } finally {
    await session.endSession();
  }

  report({ phase: "finishing" });

  // bulkWrite updates skip Mongoose middleware; refresh search tags of changed
  // universities (popular courses / names). Never fails the import itself.
  if (updateOps.length) {
    await retagModel(University).catch((error) =>
      console.error("Search tag refresh after import failed:", error.message),
    );
  }

  const updatedDocs = await University.find(
    { _id: { $in: existingIds } },
    { _id: 0, id: 1, name: 1, country: 1, city: 1 },
  ).lean();

  return {
    importId,
    transactional,
    created: createDocs.map((doc) => ({ id: doc.id, name: doc.name, country: doc.country, city: doc.city ?? "", action: "created" })),
    updated: updatedDocs.map((doc) => ({ id: doc.id, name: doc.name, country: doc.country, city: doc.city ?? "", action: "updated" })),
    createdCustomFields: log.createdCustomFields,
    createdCourses: courseDocs.map((doc) => ({
      id: doc.id,
      courseName: doc.courseName,
      degree: doc.degree ?? "",
      universityName: doc.universityName,
      action: "created",
    })),
    updatedCourses: plan.courseUpdates.map((item) => ({
      id: item.existingCourse.id || String(item.existingCourse._id),
      courseName: item.existingCourse.courseName,
      degree: item.existingCourse.degree ?? "",
      universityName: universityOf(item.entity)?.name ?? "",
      action: "updated",
    })),
  };
}

// ======================================================
// TEMPLATE
//
// The downloadable template is the structure of a real import workbook:
// its first worksheet's name, header row (same headers, same order) and
// column widths, with no data rows and no other sheets.
//
// Source: EXCEL_TEMPLATE_FILE, default Backend/data/import-template.xlsx
// (header-only copy of the team's Excel; regenerate it from a filled
// workbook with `npm run template:build -- --from <file.xlsx>`).
// ======================================================

const DEFAULT_TEMPLATE_FILE = path.join(__dirname, "..", "..", "data", "import-template.xlsx");

const templateFile = () => process.env.EXCEL_TEMPLATE_FILE || DEFAULT_TEMPLATE_FILE;

/** Sheet name, headers and column widths of a workbook's first sheet. */
function templateStructure(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) throw new ImportError("The template workbook has no worksheet with headers.", 500);

  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // Header row = first row with a value
  let headerRow = range.s.r;
  const valueAt = (r, c) => sheet[XLSX.utils.encode_cell({ r, c })]?.v;
  while (headerRow <= range.e.r && ![...Array(range.e.c - range.s.c + 1).keys()].some((c) => clean(valueAt(headerRow, range.s.c + c)))) {
    headerRow++;
  }

  // Header cells up to the last non-empty one; texts kept exactly (also duplicates such as two "Degree")
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const value = valueAt(headerRow, c);
    headers.push(value === undefined || value === null ? "" : String(value));
  }
  while (headers.length && !headers[headers.length - 1].trim()) headers.pop();
  if (!headers.length) throw new ImportError("The template workbook has no header row.", 500);

  const widths = headers.map((header, index) => {
    const column = sheet["!cols"]?.[range.s.c + index];
    const width = column?.wch ?? column?.width;
    return Number.isFinite(width) && width > 0 ? width : Math.max(12, header.length + 4);
  });

  return { sheetName, headers, widths };
}

/** New workbook with only the header row, in one worksheet. */
function writeTemplate({ sheetName, headers, widths }) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildTemplate() {
  const file = templateFile();
  let workbook;

  try {
    workbook = XLSX.readFile(file, { sheetRows: 20, cellStyles: true });
  } catch (error) {
    throw new ImportError(
      `The Excel template file could not be read (${path.basename(file)}). Add it under Backend/data or set EXCEL_TEMPLATE_FILE. (${error.code || error.message})`,
      500,
    );
  }

  return writeTemplate(templateStructure(workbook));
}

module.exports = {
  LIMITS,
  ImportError,
  analyzeWorkbook,
  executeImport,
  buildTemplate,
  templateStructure,
  writeTemplate,
  // Exported for tests
  matchHeader,
  parseTuitionAmount,
};
