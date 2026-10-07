require("dotenv").config();

// ======================================================
// Hochschulkompass programme import (ADDITIVE ONLY)
//
// Reads programme records from a local file (JSON, CSV or XLSX supplied by
// HRK) and inserts the ones that are not in MongoDB yet as UniversityCourse
// documents. Existing documents are never updated or deleted: the only
// write operations used are create() and createIndexes().
//
//   npm run import:hochschulkompass -- --dry-run
//   npm run import:hochschulkompass -- --dry-run --limit=10
//   npm run import:hochschulkompass -- --limit=10
//   npm run import:hochschulkompass
//
// Options:
//   --dry-run               read and plan only; MongoDB is not modified
//   --limit=N               only process the first N records of the file
//   --file=PATH             input file (default data/hochschulkompass-programmes.json)
//   --report=PATH           report file (default data/hochschulkompass-import-report.json)
//   --normalized=PATH       mapped documents planned for insert (default
//                           data/hochschulkompass-programmes.normalized.json)
//   --create-universities   create University documents for universities that
//                           match no existing one (otherwise only universityName
//                           is stored). `npm run import:hochschulkompass` passes it.
// ======================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const University = require("../src/models/University");
const UniversityCourse = require("../src/models/UniversityCourse");
const {
  clean,
  normalizeName,
  createNameMatcher,
} = require("../src/utils/universityNameMatching");

const SOURCE = "hochschulkompass";
const COUNTRY = "Germany";
const DATA_DIR = path.join(__dirname, "..", "data");

const args = process.argv.slice(2);
const option = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const DRY_RUN = args.includes("--dry-run");
const CREATE_UNIVERSITIES = args.includes("--create-universities");
const LIMIT = option("limit") ? Number(option("limit")) : undefined;
const INPUT_FILE = path.resolve(option("file") || path.join(DATA_DIR, "hochschulkompass-programmes.json"));
const REPORT_FILE = path.resolve(option("report") || path.join(DATA_DIR, "hochschulkompass-import-report.json"));
const NORMALIZED_FILE = path.resolve(option("normalized") || path.join(DATA_DIR, "hochschulkompass-programmes.normalized.json"));
const ALIAS_FILE = path.join(DATA_DIR, "hochschulkompass-university-aliases.json");

const MONGO_URI = process.env.MONGO_URI;


// ======================================================
// INPUT FIELDS
// Canonical field -> accepted column/property names (compared without
// case, spaces or punctuation), so an HRK export can be read as-is or
// with a header row renamed.
// ======================================================

const FIELDS = {
  sourceRecordId: ["sourceRecordId", "programmeId", "studiengangId", "id"],
  programmeName: ["programmeName", "programme", "programmeTitle", "studiengang", "name", "title"],
  degree: ["degree", "abschluss"],
  studyType: ["studyType", "studientyp"],
  studyMode: ["studyMode", "modesOfStudy", "modeOfStudy", "studienform"],
  admissionMode: ["admissionMode", "modeOfAdmission", "zulassungsmodus", "admissionRestriction"],
  subjectArea: ["subjectArea", "subject", "studienfeld", "faechergruppe"],
  specialisation: ["specialisation", "specialization", "schwerpunkt"],
  duration: ["duration", "standardStudyPeriod", "regelstudienzeit"],
  ects: ["ects", "credits", "ectsCredits"],
  languages: ["languages", "language", "languageOfInstruction", "unterrichtssprache"],
  startSemester: ["startSemester", "startDate", "studienbeginn", "intake"],
  applicationDeadline: ["applicationDeadline", "applicationPeriod", "bewerbungsfrist"],
  applicationMethod: ["applicationMethod", "applicationProcedure", "howToApply", "bewerbungsverfahren"],
  admissionRequirements: ["admissionRequirements", "zugangsvoraussetzungen"],
  tuitionFees: ["tuitionFees", "tuitionFee", "studiengebuehren", "costs"],
  programmeUrl: ["programmeUrl", "programmeWebsite", "studiengangUrl"],
  sourceUrl: ["sourceUrl", "detailUrl", "learnMore", "hochschulkompassUrl"],
  universityName: ["universityName", "university", "hochschule", "institution"],
  universityId: ["universityId", "hochschulId", "institutionId"],
  universityType: ["universityType", "hochschultyp", "institutionType"],
  city: ["city", "location", "ort", "standort", "studienort"],
  state: ["state", "bundesland"],
  universityWebsite: ["universityWebsite", "universityUrl"],
  lastVerified: ["lastVerified", "lastUpdated", "stand"],
};

// The search filters this import is limited to (normalized, substring match).
const ALLOWED_ADMISSION_MODES = [
  "without admission restriction", "zulassungsfrei",
  "local admission restriction", "ortlich zulassungsbeschrankt",
  "nationwide admission restriction", "bundesweit zulassungsbeschrankt",
  "selection procedure", "qualifying examination", "auswahlverfahren", "eignungsprufung",
];
const FULL_TIME = /full[\s-]*time|vollzeit/i;
const OUT_OF_SCOPE_DEGREE = /bachelor|diplom|staatsexamen|state examination|promotion|doctor|ph\.?\s?d/i;

const IMPORTANT_FIELDS = [
  "sourceRecordId", "degree", "studyMode", "admissionMode", "city", "state",
  "duration", "ects", "languages", "startSemester", "sourceUrl", "programmeUrl",
];


// ======================================================
// HELPERS
// ======================================================

const fieldKey = (name) => clean(name).toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELD_LOOKUP = new Map(
  Object.entries(FIELDS).flatMap(([field, names]) =>
    names.map((name) => [fieldKey(name), field]),
  ),
);

/** Trim and collapse whitespace; arrays are joined. Empty -> undefined. */
function text(value) {
  if (Array.isArray(value)) {
    value = value.map(text).filter(Boolean).join(", ");
  }

  const result = clean(value).replace(/\s+/g, " ");

  return result || undefined;
}

const isUrl = (value) => /^https?:\/\/\S+$/i.test(value ?? "");

const hash = (value) =>
  crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);

const compact = (doc) =>
  Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined && value !== ""));

function decodeText(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function readInput(file) {
  if (/\.json$/i.test(file)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(data) ? data : data.records ?? data.programmes ?? data.data;

    if (!Array.isArray(rows)) {
      throw new Error("JSON input must be an array or contain a records/programmes/data array");
    }

    return rows;
  }

  // CSV: decode as UTF-8 when the bytes are valid UTF-8 (with or without BOM),
  // otherwise as Windows-1252, so umlauts are preserved either way.
  const workbook = /\.(csv|txt|tsv)$/i.test(file)
    ? XLSX.read(decodeText(fs.readFileSync(file)), { type: "string", raw: true })
    : XLSX.readFile(file, { raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

/** Maps one source row onto the canonical fields; unknown columns stay in sourceRow only. */
function toRecord(row) {
  const record = {};

  for (const [key, value] of Object.entries(row)) {
    const field = FIELD_LOOKUP.get(fieldKey(key));
    if (field && record[field] === undefined) record[field] = text(value);
  }

  return record;
}

function identity(record) {
  if (record.sourceRecordId) {
    return `id:${record.sourceRecordId}`;
  }

  return "k:" + [
    record.universityName,
    record.programmeName,
    record.degree,
    record.city,
    record.studyMode,
  ].map(normalizeName).join("|");
}

function readableId(prefix, recordId, key) {
  const fromSource = clean(recordId).replace(/[^A-Za-z0-9_-]/g, "");

  return `${prefix}${fromSource || hash(key)}`;
}

/** Errors exclude a record; warnings are reported only. */
function validate(record) {
  const errors = [];
  const warnings = [];

  if (!record.programmeName) errors.push("Missing programme name");
  if (!record.universityName) errors.push("Missing university name");

  if (record.studyMode && !FULL_TIME.test(record.studyMode)) {
    errors.push(`Out of scope: study mode "${record.studyMode}" is not full-time`);
  }

  if (record.degree && OUT_OF_SCOPE_DEGREE.test(record.degree)) {
    errors.push(`Out of scope: degree "${record.degree}" is not a Master/Magister`);
  }

  if (record.admissionMode) {
    const mode = normalizeName(record.admissionMode);

    if (!ALLOWED_ADMISSION_MODES.some((allowed) => mode.includes(allowed))) {
      errors.push(`Out of scope: admission mode "${record.admissionMode}"`);
    }
  }

  if (!record.studyMode) warnings.push("Missing study mode (full-time not confirmed)");
  if (!record.degree) warnings.push("Missing degree");

  for (const field of ["sourceUrl", "programmeUrl", "universityWebsite"]) {
    if (record[field] && !isUrl(record[field])) {
      warnings.push(`${field} is not a URL and was not stored: "${record[field]}"`);
      record[field] = undefined;
    }
  }

  if (record.ects !== undefined) {
    const ects = Number(record.ects.replace(",", ".").match(/\d+(\.\d+)?/)?.[0]);

    if (Number.isFinite(ects)) {
      record.ectsNumber = ects;
    } else {
      warnings.push(`ECTS "${record.ects}" is not a number and was not stored`);
    }
  }

  return { errors, warnings };
}

const summaryOf = (record, index) => compact({
  index,
  sourceRecordId: record.sourceRecordId,
  programmeName: record.programmeName,
  universityName: record.universityName,
  degree: record.degree,
  city: record.city,
});

/** Content fingerprint of every document, to prove existing data was not touched. */
async function snapshot(Model) {
  const docs = await Model.find({}).lean();

  return new Map(docs.map((doc) => [String(doc._id), hash(JSON.stringify(doc))]));
}


// ======================================================
// UNIVERSITY MATCHING
// ======================================================

function loadAliases() {
  if (!fs.existsSync(ALIAS_FILE)) return new Map();

  const { aliases = {} } = JSON.parse(fs.readFileSync(ALIAS_FILE, "utf8"));

  return new Map(Object.entries(aliases).map(([name, id]) => [normalizeName(name), id]));
}

function createUniversityResolver(universities) {
  const byId = new Map(universities.filter((u) => u.id).map((u) => [u.id, u]));
  const byObjectId = new Map(universities.map((u) => [String(u._id), u]));
  const bySourceId = new Map(
    universities
      .filter((u) => u.source === SOURCE && u.sourceRecordId)
      .map((u) => [u.sourceRecordId, u]),
  );
  const aliases = loadAliases();
  const matchName = createNameMatcher(
    universities.map((u) => ({ key: String(u._id), name: u.name })),
  );

  return (record) => {
    if (record.universityId && bySourceId.has(record.universityId)) {
      return { university: bySourceId.get(record.universityId), via: "source id" };
    }

    const aliasId = aliases.get(normalizeName(record.universityName));

    if (aliasId) {
      return byId.has(aliasId)
        ? { university: byId.get(aliasId), via: "alias" }
        : { reason: `Alias points to ${aliasId}, which does not exist` };
    }

    const match = matchName(record.universityName);

    return match.groupKey
      ? { university: byObjectId.get(match.groupKey), via: "name" }
      : { reason: match.reason };
  };
}


// ======================================================
// MAIN
// ======================================================

async function importHochschulkompass() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error("Place the Hochschulkompass export (JSON, CSV or XLSX) there or pass --file=PATH.");
    process.exit(1);
  }

  if (!MONGO_URI) {
    console.error("MONGO_URI is missing in .env");
    process.exit(1);
  }

  if (LIMIT !== undefined && !(Number.isInteger(LIMIT) && LIMIT > 0)) {
    console.error("--limit must be a positive whole number");
    process.exit(1);
  }

  const importId = `HSK-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const importedAt = new Date();

  const rows = readInput(INPUT_FILE);
  const selected = LIMIT ? rows.slice(0, LIMIT) : rows;

  const report = {
    generatedAt: importedAt.toISOString(),
    mode: DRY_RUN ? "dry-run" : "import",
    importId: DRY_RUN ? undefined : importId,
    inputFile: INPUT_FILE,
    options: { limit: LIMIT ?? null, createUniversities: CREATE_UNIVERSITIES },
    summary: {},
    dataQuality: { missingFields: {} },
    unmatchedUniversities: [],
    universityLinks: [],
    newUniversities: [],
    invalid: [],
    duplicatesInFile: [],
    alreadyExisting: [],
    failed: [],
    warnings: [],
    inserted: [],
  };

  console.log(`Hochschulkompass import (${DRY_RUN ? "DRY RUN - MongoDB will not be modified" : "IMPORT"})`);
  console.log(`Input: ${INPUT_FILE}`);
  console.log(`Records in file: ${rows.length}${LIMIT ? `, processing first ${selected.length}` : ""}`);

  // autoIndex is off so a dry run creates nothing; the import creates the
  // new UniversityCourse index explicitly below.
  await mongoose.connect(MONGO_URI, { autoIndex: false });
  console.log("MongoDB connected.");

  try {
    // ---------- Existing data (read only) ----------

    const universities = await University.find(
      {},
      { id: 1, name: 1, source: 1, sourceRecordId: 1 },
    ).lean();

    const existingCourses = await UniversityCourse.find(
      {},
      { id: 1, source: 1, sourceKey: 1, universityId: 1, courseName: 1, degree: 1 },
    ).lean();

    const existingIds = new Set(existingCourses.map((course) => course.id).filter(Boolean));
    const existingSourceKeys = new Set(
      existingCourses.filter((course) => course.source === SOURCE).map((course) => course.sourceKey),
    );
    // Same programme entered another way (manual / other import) at the same university
    const existingProgrammeKeys = new Set(
      existingCourses
        .filter((course) => course.universityId)
        .map((course) => `${course.universityId}|${normalizeName(course.courseName)}|${normalizeName(course.degree)}`),
    );

    const resolveUniversity = createUniversityResolver(universities);

    // ---------- Validate, deduplicate, plan ----------

    const seenKeys = new Map();
    const plannedUniversities = new Map();
    const linkedUniversities = new Map();
    const unmatched = new Map();
    const toInsert = [];
    const quality = { missingProgrammeName: 0, missingUniversityName: 0, missingSourceUrl: 0, missingProgrammeUrl: 0 };

    selected.forEach((row, index) => {
      const record = toRecord(row);
      const summary = summaryOf(record, index);

      if (!record.programmeName) quality.missingProgrammeName++;
      if (!record.universityName) quality.missingUniversityName++;
      if (!record.sourceUrl) quality.missingSourceUrl++;
      if (!record.programmeUrl) quality.missingProgrammeUrl++;

      IMPORTANT_FIELDS.forEach((field) => {
        if (!record[field]) {
          report.dataQuality.missingFields[field] = (report.dataQuality.missingFields[field] ?? 0) + 1;
        }
      });

      const { errors, warnings } = validate(record);

      warnings.forEach((warning) => report.warnings.push({ ...summary, warning }));

      if (errors.length) {
        report.invalid.push({ ...summary, reasons: errors });
        return;
      }

      const sourceKey = identity(record);
      const id = readableId("HSK-", record.sourceRecordId, sourceKey);

      if (seenKeys.has(sourceKey)) {
        report.duplicatesInFile.push({ ...summary, sourceKey, duplicateOfIndex: seenKeys.get(sourceKey) });
        return;
      }

      seenKeys.set(sourceKey, index);

      // University
      const { university, via, reason } = resolveUniversity(record);
      let universityRef;

      if (university) {
        universityRef = { existing: university };
        linkedUniversities.set(university.id || String(university._id), {
          sourceName: record.universityName,
          linkedTo: university.id || String(university._id),
          linkedName: university.name,
          via,
        });
      } else {
        const nameKey = normalizeName(record.universityName);

        if (!unmatched.has(nameKey)) {
          unmatched.set(nameKey, { name: record.universityName, reason, programmes: 0 });
        }
        unmatched.get(nameKey).programmes++;

        if (CREATE_UNIVERSITIES) {
          if (!plannedUniversities.has(nameKey)) {
            plannedUniversities.set(nameKey, compact({
              id: readableId("HSK-U-", record.universityId, nameKey),
              name: record.universityName,
              country: COUNTRY,
              city: record.city,
              state: record.state,
              website: record.universityWebsite,
              universityType: record.universityType,
              source: SOURCE,
              sourceRecordId: record.universityId,
              sourceKey: nameKey,
              lastVerified: record.lastVerified,
              importSource: { fileName: path.basename(INPUT_FILE), importId, importedAt },
            }));
          }

          universityRef = { planned: plannedUniversities.get(nameKey) };
        }
      }

      // Already in MongoDB?
      const universityObjectId = universityRef?.existing?._id;
      const programmeKey = universityObjectId &&
        `${universityObjectId}|${normalizeName(record.programmeName)}|${normalizeName(record.degree)}`;

      if (existingSourceKeys.has(sourceKey) || existingIds.has(id) || existingProgrammeKeys.has(programmeKey)) {
        report.alreadyExisting.push({
          ...summary,
          id,
          matchedOn: existingSourceKeys.has(sourceKey) ? "sourceKey" : existingIds.has(id) ? "id" : "university + programme + degree",
        });
        return;
      }

      toInsert.push({
        summary,
        universityRef,
        doc: compact({
          id,
          universityExternalId: universityRef?.existing?.id ?? universityRef?.planned?.id,
          universityName: record.universityName,
          courseName: record.programmeName,
          degree: record.degree,
          specialization: record.specialisation,
          duration: record.duration,
          language: record.languages,
          intake: record.startSemester,
          applicationDeadline: record.applicationDeadline,
          eligibility: record.admissionRequirements,
          tuitionFee: record.tuitionFees,
          sourceUrl: record.sourceUrl,
          lastVerified: record.lastVerified,
          source: SOURCE,
          sourceRecordId: record.sourceRecordId,
          sourceKey,
          studyType: record.studyType,
          studyMode: record.studyMode,
          admissionMode: record.admissionMode,
          applicationMethod: record.applicationMethod,
          subjectArea: record.subjectArea,
          ects: record.ectsNumber,
          city: record.city,
          state: record.state,
          programmeUrl: record.programmeUrl,
          importId: DRY_RUN ? undefined : importId,
          importedAt: DRY_RUN ? undefined : importedAt,
          sourceRow: row,
        }),
      });
    });

    report.dataQuality = { ...quality, ...report.dataQuality };
    report.unmatchedUniversities = [...unmatched.values()].sort((a, b) => b.programmes - a.programmes);
    report.universityLinks = [...linkedUniversities.values()];

    const usedPlannedUniversities = new Set(
      toInsert.map((item) => item.universityRef?.planned).filter(Boolean),
    );

    // ---------- Write (import mode only) ----------

    let insertedUniversities = 0;
    let duplicatesAtInsert = 0;
    let modifiedExisting = 0;

    if (DRY_RUN) {
      report.newUniversities = [...usedPlannedUniversities].map(({ id, name, city }) => ({ id, name, city }));
      report.inserted = toInsert.map(({ doc }) => ({ id: doc.id, courseName: doc.courseName, universityName: doc.universityName }));
    } else {
      const before = {
        universities: await snapshot(University),
        courses: await snapshot(UniversityCourse),
      };

      // Creates the partial unique { source, sourceKey } index if it is missing.
      // Building an index does not change any document.
      await UniversityCourse.createIndexes();

      for (const planned of usedPlannedUniversities) {
        try {
          const created = await University.create(planned);
          planned._id = created._id;
          insertedUniversities++;
          report.newUniversities.push({ id: created.id, name: created.name, city: created.city });
        } catch (error) {
          report.failed.push({ university: planned.name, error: error.message });
        }
      }

      for (const { doc, summary, universityRef } of toInsert) {
        const universityId = universityRef?.existing?._id ?? universityRef?.planned?._id;

        if (universityRef?.planned && !universityId) {
          report.failed.push({ ...summary, error: "University could not be created" });
          continue;
        }

        try {
          const created = await UniversityCourse.create(universityId ? { ...doc, universityId } : doc);
          report.inserted.push({ id: created.id, courseName: created.courseName, universityName: created.universityName });
        } catch (error) {
          if (error.code === 11000) {
            duplicatesAtInsert++;
            report.alreadyExisting.push({ ...summary, id: doc.id, matchedOn: "unique index at insert" });
          } else {
            report.failed.push({ ...summary, error: error.message });
          }
        }
      }

      // Verify that no pre-existing document changed
      const after = {
        universities: await snapshot(University),
        courses: await snapshot(UniversityCourse),
      };

      for (const key of ["universities", "courses"]) {
        before[key].forEach((fingerprint, _id) => {
          if (after[key].get(_id) !== fingerprint) modifiedExisting++;
        });
      }

      report.verification = {
        universitiesBefore: before.universities.size,
        universitiesAfter: after.universities.size,
        coursesBefore: before.courses.size,
        coursesAfter: after.courses.size,
        existingRecordsModifiedOrRemoved: modifiedExisting,
      };
    }

    const reusedUniversities = new Set(
      toInsert.map((item) => item.universityRef?.existing?._id).filter(Boolean).map(String),
    );

    report.summary = {
      totalInFile: rows.length,
      processed: selected.length,
      valid: selected.length - report.invalid.length,
      invalid: report.invalid.length,
      duplicatesInFile: report.duplicatesInFile.length,
      alreadyExisting: report.alreadyExisting.length,
      [DRY_RUN ? "wouldInsert" : "inserted"]: report.inserted.length,
      failed: report.failed.length,
      [DRY_RUN ? "wouldInsertUniversities" : "newUniversitiesInserted"]: DRY_RUN ? usedPlannedUniversities.size : insertedUniversities,
      existingUniversitiesReused: reusedUniversities.size,
      programmesWithoutUniversityLink: toInsert.filter((item) => !item.universityRef).length,
      unmatchedUniversityNames: report.unmatchedUniversities.length,
      warnings: report.warnings.length,
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

    // Intermediate data: exactly what is (or would be) written, for review
    fs.writeFileSync(NORMALIZED_FILE, JSON.stringify({
      generatedAt: report.generatedAt,
      mode: report.mode,
      universities: [...usedPlannedUniversities].map(({ _id, ...university }) => university),
      programmes: toInsert.map(({ doc, universityRef }) => ({
        ...doc,
        universityLink: universityRef?.existing?.id ?? universityRef?.planned?.id ?? null,
      })),
    }, null, 2));

    // ---------- Console summary ----------

    const s = report.summary;
    console.log("");
    console.log(DRY_RUN ? "Hochschulkompass Dry Run Completed (no changes made)" : "Hochschulkompass Import Completed");
    console.log("");
    console.log(`Total in file:              ${s.totalInFile}`);
    console.log(`Processed:                  ${s.processed}`);
    console.log(`Already existing:           ${s.alreadyExisting}`);
    console.log(`${DRY_RUN ? "Would insert" : "New programmes inserted"}:    ${DRY_RUN ? s.wouldInsert : s.inserted}`);
    console.log(`Duplicates skipped:         ${s.duplicatesInFile + duplicatesAtInsert}`);
    console.log(`Invalid records:            ${s.invalid}`);
    console.log(`Failed records:             ${s.failed}`);
    console.log(`${DRY_RUN ? "Would insert universities" : "New universities inserted"}: ${DRY_RUN ? s.wouldInsertUniversities : s.newUniversitiesInserted}`);
    console.log(`Existing universities reused: ${s.existingUniversitiesReused}`);
    console.log(`Programmes without university link: ${s.programmesWithoutUniversityLink}`);
    console.log(`Unmatched university names: ${s.unmatchedUniversityNames}${CREATE_UNIVERSITIES ? "" : " (use --create-universities to create them)"}`);

    if (!DRY_RUN) {
      console.log("");
      console.log(
        modifiedExisting === 0
          ? "Verified: no existing records were modified."
          : `WARNING: ${modifiedExisting} pre-existing records differ after the import - see report.verification`,
      );
    }

    console.log("");
    console.log(`Report: ${REPORT_FILE}`);
    console.log(`Planned documents: ${NORMALIZED_FILE}`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  importHochschulkompass().catch((error) => {
    console.error("Hochschulkompass import failed:", error);
    process.exit(1);
  });
}

// Exported for tests
module.exports = {
  FIELDS,
  readInput,
  toRecord,
  validate,
  identity,
  readableId,
  createUniversityResolver,
};
