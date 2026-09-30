require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const University = require("../src/models/University");
const Country = require("../src/models/Country");

const MONGO_URI = process.env.MONGO_URI;

const DRY_RUN = process.argv.includes("--dry-run");

const excelPath =
  process.env.GERMANY_XLSX_PATH ||
  path.join(
    __dirname,
    "..",
    "data",
    "Germany(1).xlsx",
  );

const COUNTRY = "Germany";


// ======================================================
// CHECK ENVIRONMENT
// ======================================================

if (!MONGO_URI && !DRY_RUN) {
  console.error("MONGO_URI is missing in .env");
  process.exit(1);
}

if (!fs.existsSync(excelPath)) {
  console.error("Excel file not found:");
  console.error(excelPath);
  process.exit(1);
}


// ======================================================
// HELPERS
// ======================================================

function clean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}


function parseTuition(value) {
  const text = clean(value);

  if (!text) {
    return {
      min: undefined,
      max: undefined,
    };
  }

  const numbers = [
    ...text.matchAll(/\d[\d,]*/g),
  ]
    .map((match) =>
      Number(
        match[0].replace(/,/g, ""),
      ),
    )
    .filter((number) =>
      Number.isFinite(number),
    );

  if (numbers.length >= 2) {
    return {
      min: numbers[0],
      max: numbers[1],
    };
  }

  if (numbers.length === 1) {
    return {
      min: numbers[0],
      max: numbers[0],
    };
  }

  return {
    min: undefined,
    max: undefined,
  };
}


function splitCourses(value) {
  return clean(value)
    .split(",")
    .map((course) => course.trim())
    .filter(Boolean);
}


function splitRequirements(value) {
  return clean(value)
    .split(";")
    .map((requirement) =>
      requirement.trim(),
    )
    .filter(Boolean);
}


function createUniversityId(index) {
  return `DEU-${String(index).padStart(3, "0")}`;
}


/** Rows as arrays; rowNumber is the 1-based Excel row. */
function sheetRows(workbook, sheetName, options = {}) {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return [];
  }

  return XLSX.utils
    .sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
      ...options,
    })
    .map((cells, index) => ({
      rowNumber: index + 1,
      cells: cells.map(clean),
    }));
}


const isBlankRow = (cells) =>
  cells.every((cell) => !cell);


// ======================================================
// UNIVERSITY NAME MATCHING (shared with the Excel import)
// ======================================================

const {
  normalizeName,
  createNameMatcher: createSharedNameMatcher,
} = require("../src/utils/universityNameMatching");

function createNameMatcher(groups) {
  const match = createSharedNameMatcher(groups);

  return (name) => {
    const result = match(name);

    return result.groupKey || result.ambiguous
      ? result
      : { reason: "No Sheet2 university with this name" };
  };
}


// ======================================================
// SHEET2: MAIN UNIVERSITY DATA
// ======================================================

function readSheet2(workbook) {
  const sheet =
    workbook.Sheets["Sheet2"];

  if (!sheet) {
    throw new Error(
      "Sheet2 was not found in the Excel file.",
    );
  }

  const rows =
    XLSX.utils.sheet_to_json(
      sheet,
      {
        defval: "",
        raw: true,
      },
    );

  const groups = new Map();

  let headerRowsSkipped = 0;

  for (const row of rows) {
    const universityName =
      clean(row["University"]);

    // Skip empty rows and the header row Sheet2 repeats between blocks
    if (!universityName) {
      continue;
    }

    if (
      universityName === "University" &&
      clean(row["City"]) === "City"
    ) {
      headerRowsSkipped++;
      continue;
    }

    const sheet2Data = {
      University:
        universityName,

      City:
        clean(row["City"]),

      "Annual Tuition Fee (EUR)":
        clean(row["Annual Tuition Fee (EUR)"]),

      IELTS:
        clean(row["IELTS"]),

      "Other Requirements":
        clean(row["Other Requirements"]),

      "Application Opens":
        clean(row["Application Opens"]),

      "Application Deadline":
        clean(row["Application Deadline"]),

      "Major Courses":
        clean(row["Major Courses"]),

      "Recommended Indian %":
        clean(row["Recommended Indian %"]),
    };

    // __rowNum__ is xlsx's 0-based row index
    const rowNumber = row.__rowNum__ + 1;

    const key = normalizeName(universityName);

    if (groups.has(key)) {
      // Same university listed again in Sheet2: keep the first row as the
      // main record and preserve the later row as-is.
      groups.get(key).duplicateRows.push({
        rowNumber,
        ...sheet2Data,
      });
      continue;
    }

    groups.set(key, {
      key,
      name: universityName,
      rowNumber,
      sheet2Data,
      duplicateRows: [],
    });
  }

  return {
    rowsRead: rows.length,
    headerRowsSkipped,
    groups: [...groups.values()],
  };
}


function buildUniversityFields(group) {
  const data = group.sheet2Data;

  const tuition =
    parseTuition(data["Annual Tuition Fee (EUR)"]);

  const requirements =
    splitRequirements(data["Other Requirements"]);

  const aps =
    requirements.find(
      (requirement) =>
        requirement
          .toLowerCase()
          .includes("aps"),
    );

  return {
    name: group.name,
    country: COUNTRY,
    city: data.City,
    annualTuitionFee: data["Annual Tuition Fee (EUR)"],
    tuitionFeeMin: tuition.min,
    tuitionFeeMax: tuition.max,
    englishRequirement: data.IELTS,
    requirements,
    aps: aps || undefined,
    applicationOpens: data["Application Opens"],
    applicationDeadline: data["Application Deadline"],
    popularCourses: splitCourses(data["Major Courses"]),
    recommendedIndianPercentage: data["Recommended Indian %"],

    // Complete original Sheet2 information
    sheet2Data: data,
    sourceKey: group.key,
    sheet2DuplicateRows: group.duplicateRows.length
      ? group.duplicateRows
      : undefined,
  };
}


// ======================================================
// UNIVERSITY-LEVEL SHEETS (1, 3, 4)
// ======================================================

function linkUniversitySheets(workbook, groups) {
  const match = createNameMatcher(groups);

  const linked = new Map(
    groups.map((group) => [
      group.key,
      {
        website: undefined,
        ranking: undefined,
        rankingSource: undefined,
        admissionDifficulty: [],
        linkedSheetRows: [],
      },
    ]),
  );

  const unlinked = [];
  const linkedCounts = {};

  const link = (sheet, rowNumber, name, data, apply) => {
    const result = match(name);

    if (!result.groupKey) {
      unlinked.push({ sheet, rowNumber, name, reason: result.reason, data });
      return;
    }

    const target = linked.get(result.groupKey);

    target.linkedSheetRows.push({ sheet, rowNumber, sourceName: name, data });
    apply(target);

    linkedCounts[sheet] = (linkedCounts[sheet] ?? 0) + 1;
  };

  // ---------- Sheet3: official websites ----------

  for (const { rowNumber, cells } of sheetRows(workbook, "Sheet3").slice(1)) {
    const [name, website] = cells;

    if (!name || (name === "University" && website === "Official Website")) {
      continue;
    }

    link(
      "Sheet3",
      rowNumber,
      name,
      { University: name, "Official Website": website },
      (target) => {
        target.website ??= website || undefined;
      },
    );
  }

  // ---------- Sheet4: QS ranking ----------

  const sheet4 = sheetRows(workbook, "Sheet4");
  const rankHeader = sheet4[0]?.cells[0] ?? "";
  const rankingSource =
    rankHeader.match(/\(([^)]*)\)/)?.[1] || rankHeader;

  for (const { rowNumber, cells } of sheet4.slice(1)) {
    const [rank, name, website] = cells;

    if (!name) continue;

    link(
      "Sheet4",
      rowNumber,
      name,
      {
        [rankHeader]: rank,
        University: name,
        "Official Website": website,
      },
      (target) => {
        target.ranking ??= rank || undefined;
        target.rankingSource ??= rank ? rankingSource : undefined;
        target.website ??= website || undefined;
      },
    );
  }

  // ---------- Sheet1: admission difficulty by field ----------
  // Row 1 holds the fields of study. Each block starts after a blank row
  // with a tier row (the same level in every column), followed by one
  // university per column. "**Name**" marks private universities.

  const sheet1 = sheetRows(workbook, "Sheet1");
  const fields = sheet1[0]?.cells ?? [];
  const sheet1Notes = [];

  let level = "";
  let previousBlank = false;

  for (const { rowNumber, cells } of sheet1.slice(1)) {
    if (isBlankRow(cells)) {
      previousBlank = true;
      continue;
    }

    const filled = cells.filter(Boolean);

    if (previousBlank) {
      previousBlank = false;

      if (
        filled.length === fields.length &&
        filled.every((cell) => cell === filled[0])
      ) {
        level = filled[0];
        continue;
      }

      if (filled.length === 1 && cells[0].startsWith("*")) {
        sheet1Notes.push(cells[0]);
        continue;
      }
    }

    cells.forEach((cell, column) => {
      if (!cell) return;

      const field = fields[column];

      link(
        "Sheet1",
        rowNumber,
        cell,
        { field, level, cell },
        (target) => {
          target.admissionDifficulty.push({
            field,
            level,
            markedPrivate: /^\*\*.*\*\*$/.test(cell),
            sourceName: cell,
            sheet: "Sheet1",
            rowNumber,
          });
        },
      );
    });
  }

  return {
    linked,
    unlinked,
    linkedCounts,
    sheet1Notes,
  };
}


// ======================================================
// COUNTRY-LEVEL SHEETS (5-12)
// ======================================================

function readCountrySheets(workbook, sheet1Notes) {
  // ---------- Sheet5: admission process ----------

  const admissionSteps = sheetRows(workbook, "Sheet5")
    .slice(2)
    .filter(({ cells }) => cells[0] && cells[1])
    .map(({ cells }) => ({
      step: Number(cells[0]),
      process: cells[1],
    }));

  // ---------- Sheet6: required documents ----------

  const requiredDocuments = sheetRows(workbook, "Sheet6")
    .slice(2)
    .filter(({ cells }) => cells[0])
    .map(({ cells }) => ({
      document: cells[0],
      purpose: cells[1],
      mandatory: cells[2],
    }));

  // ---------- Living cost: blocked account proof of funds ----------
  // The workbook has no university- or city-level living cost. The only
  // living-cost figure is the Germany-wide blocked account amount.

  const fundsPattern =
    /EUR\s*([\d,]+)\s*\/\s*(year|month)/i;

  const blockedAccount = requiredDocuments.find((document) =>
    /blocked account/i.test(document.document) &&
    fundsPattern.test(document.purpose),
  );

  let living = {};

  if (blockedAccount) {
    const [, amount, period] =
      blockedAccount.purpose.match(fundsPattern);

    const value = Number(amount.replace(/,/g, ""));

    living = {
      livingCostMin: value,
      livingCostMax: value,
      livingCostCurrency: "EUR",
      livingCostPeriod:
        period.toLowerCase() === "year" ? "Year" : "Month",
      livingCostSource:
        `${blockedAccount.document}: ${blockedAccount.purpose} (Sheet6)`,
      financialRequirements:
        `${blockedAccount.document} - ${blockedAccount.purpose}`,
    };
  }

  // ---------- Sheet7: intakes (displayed dates, e.g. "1-Oct") ----------

  const sheet7 = sheetRows(workbook, "Sheet7", { raw: false });

  const intakes = sheet7
    .slice(1)
    .filter(({ cells }) => cells[0])
    .map(({ cells }) => ({
      intake: cells[0],
      classStart: cells[1],
      applicationStart: cells[2],
      applicationDeadline: cells[3],
    }));

  // ---------- Sheet8: how many universities to suggest per GPA ----------

  const universitySuggestionGuide = workbook.Sheets["Sheet8"]
    ? XLSX.utils.sheet_to_json(workbook.Sheets["Sheet8"], {
        defval: "",
        raw: false,
      })
    : [];

  // ---------- Sheet12: Indian CGPA to German grade ----------

  const gradeConversion = sheetRows(workbook, "Sheet12")
    .slice(3)
    .filter(({ cells }) => cells[0])
    .map(({ cells }) => ({
      universityType: cells[0],
      typicalMinimumCgpa: cells[1],
      germanGradeEquivalent: cells[2],
    }));

  // ---------- Sheets 9-11: free-text guidance ----------

  const referenceNotes = ["Sheet9", "Sheet10", "Sheet11"]
    .map((sheet) => {
      const lines = sheetRows(workbook, sheet)
        .map(({ cells }) => cells.filter(Boolean).join(" "))
        .filter(Boolean);

      return {
        sheet,
        title: lines[0] ?? sheet,
        lines: lines.slice(1),
      };
    })
    .filter((note) => note.lines.length > 0);

  if (sheet1Notes.length > 0) {
    referenceNotes.push({
      sheet: "Sheet1",
      title: "Legend",
      lines: sheet1Notes,
    });
  }

  return {
    ...living,
    admissionSteps,
    requiredDocuments,
    intakes,
    universitySuggestionGuide,
    gradeConversion,
    referenceNotes,
  };
}


// ======================================================
// MAIN SEED
// ======================================================

// Workbook-owned University fields. On re-seed these are replaced
// (or removed when no longer present); other fields edited through
// the CRUD API are left untouched.
const WORKBOOK_FIELDS = [
  "name",
  "country",
  "city",
  "annualTuitionFee",
  "tuitionFeeMin",
  "tuitionFeeMax",
  "englishRequirement",
  "requirements",
  "aps",
  "applicationOpens",
  "applicationDeadline",
  "popularCourses",
  "recommendedIndianPercentage",
  "sheet2Data",
  "sourceKey",
  "sheet2DuplicateRows",
  "website",
  "ranking",
  "rankingSource",
  "admissionDifficulty",
  "linkedSheetRows",
];

function toUpdate(fields) {
  const $set = {};
  const $unset = {};

  for (const key of WORKBOOK_FIELDS) {
    const value = fields[key];

    const empty =
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0 && key !== "requirements" && key !== "popularCourses");

    if (empty) {
      $unset[key] = "";
    } else {
      $set[key] = value;
    }
  }

  return Object.keys($unset).length ? { $set, $unset } : { $set };
}


const isHeaderRowDocument = (university) =>
  university.name === "University" &&
  university.city === "City";


async function seedGermany() {
  try {
    console.log("");
    console.log(
      "======================================",
    );
    console.log(
      `Germany Workbook Seed Started${DRY_RUN ? " (dry run)" : ""}`,
    );
    console.log(
      "======================================",
    );

    // --------------------------------------------------
    // READ EXCEL
    // --------------------------------------------------

    console.log(
      `Reading Excel: ${excelPath}`,
    );

    const workbook =
      XLSX.readFile(excelPath);

    console.log(
      `Sheets found: ${workbook.SheetNames.join(", ")}`,
    );

    const sheet2 = readSheet2(workbook);

    const {
      linked,
      unlinked,
      linkedCounts,
      sheet1Notes,
    } = linkUniversitySheets(workbook, sheet2.groups);

    const countryData =
      readCountrySheets(workbook, sheet1Notes);

    const universities = sheet2.groups.map((group) => {
      const extra = linked.get(group.key);

      return {
        ...buildUniversityFields(group),
        website: extra.website,
        ranking: extra.ranking,
        rankingSource: extra.rankingSource,
        admissionDifficulty: extra.admissionDifficulty.length
          ? extra.admissionDifficulty
          : undefined,
        linkedSheetRows: extra.linkedSheetRows.length
          ? extra.linkedSheetRows
          : undefined,
      };
    });

    const rowCounts = Object.fromEntries(
      workbook.SheetNames.map((sheet) => [
        sheet,
        sheetRows(workbook, sheet).filter(({ cells }) => !isBlankRow(cells)).length,
      ]),
    );

    const excelSource = {
      file: path.basename(excelPath),
      importedAt: new Date().toISOString(),
      sheets: [
        { sheet: "Sheet1", role: "Admission difficulty by field (linked to universities)" },
        { sheet: "Sheet2", role: "Main university data" },
        { sheet: "Sheet3", role: "Official websites (linked to universities)" },
        { sheet: "Sheet4", role: "QS ranking (linked to universities)" },
        { sheet: "Sheet5", role: "Admission process steps (country)" },
        { sheet: "Sheet6", role: "Required documents and blocked account (country)" },
        { sheet: "Sheet7", role: "Intakes and deadlines (country)" },
        { sheet: "Sheet8", role: "Universities to suggest per GPA (country)" },
        { sheet: "Sheet9", role: "Student visa problems (reference text)" },
        { sheet: "Sheet10", role: "Admission problems (reference text)" },
        { sheet: "Sheet11", role: "Bachelors after 12th (reference text)" },
        { sheet: "Sheet12", role: "Indian CGPA to German grade (country)" },
      ]
        .filter(({ sheet }) => workbook.SheetNames.includes(sheet))
        .map((entry) => ({ ...entry, nonEmptyRows: rowCounts[entry.sheet] })),
    };

    // --------------------------------------------------
    // REPORT
    // --------------------------------------------------

    console.log("");
    console.log(`Sheet2 rows read: ${sheet2.rowsRead}`);
    console.log(`Sheet2 repeated header rows skipped: ${sheet2.headerRowsSkipped}`);
    console.log(`Universities (unique Sheet2 names): ${universities.length}`);

    sheet2.groups
      .filter((group) => group.duplicateRows.length)
      .forEach((group) =>
        console.log(
          `  Sheet2 duplicate kept as extra row: ${group.name} (rows ${[group.rowNumber, ...group.duplicateRows.map((row) => row.rowNumber)].join(", ")})`,
        ),
      );

    console.log("");
    console.log("Linked rows:", linkedCounts);
    console.log(`With website: ${universities.filter((u) => u.website).length}`);
    console.log(`With QS ranking: ${universities.filter((u) => u.ranking).length}`);
    console.log(`With admission difficulty: ${universities.filter((u) => u.admissionDifficulty).length}`);

    console.log("");
    console.log(`Unlinked university rows: ${unlinked.length}`);
    unlinked.forEach((row) =>
      console.log(`  ${row.sheet} row ${row.rowNumber}: ${row.name} -> ${row.reason}`),
    );

    console.log("");
    console.log(
      "Living cost:",
      countryData.livingCostMin !== undefined
        ? `${countryData.livingCostCurrency} ${countryData.livingCostMin} / ${countryData.livingCostPeriod} (${countryData.livingCostSource})`
        : "not found",
    );
    console.log(`Intakes: ${countryData.intakes.map((intake) => intake.intake).join(", ")}`);
    console.log(`Admission steps: ${countryData.admissionSteps.length}, documents: ${countryData.requiredDocuments.length}`);

    if (DRY_RUN) {
      console.log("");
      console.log("Dry run: MongoDB was not modified.");
      return;
    }

    // --------------------------------------------------
    // CONNECT MONGODB
    // --------------------------------------------------

    console.log("");
    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log(
      "MongoDB connected.",
    );

    // --------------------------------------------------
    // UPSERT UNIVERSITIES (stable _id and id)
    // --------------------------------------------------

    const existing = await University.find({ country: COUNTRY }).lean();

    const existingByKey = new Map();
    const toDelete = [];

    for (const doc of existing) {
      // Only documents created by this seed are managed here;
      // universities added through the CRUD API are left alone.
      if (!doc.sheet2Data) continue;

      if (isHeaderRowDocument(doc)) {
        toDelete.push(doc._id);
        continue;
      }

      const key = doc.sourceKey || normalizeName(doc.name);

      if (existingByKey.has(key)) {
        toDelete.push(doc._id);
      } else {
        existingByKey.set(key, doc);
      }
    }

    let nextIdNumber =
      Math.max(
        0,
        ...existing
          .map((doc) => Number(clean(doc.id).match(/^DEU-(\d+)$/)?.[1]))
          .filter(Number.isFinite),
      ) + 1;

    let updated = 0;
    let created = 0;

    for (const university of universities) {
      const current = existingByKey.get(university.sourceKey);

      if (current) {
        await University.updateOne(
          { _id: current._id },
          toUpdate(university),
          { runValidators: true },
        );

        existingByKey.delete(university.sourceKey);
        updated++;
      } else {
        const doc = { id: createUniversityId(nextIdNumber++) };

        Object.entries(university).forEach(([key, value]) => {
          if (value !== undefined && value !== "") doc[key] = value;
        });

        await University.create(doc);
        created++;
      }
    }

    // Seeded universities no longer present in Sheet2
    existingByKey.forEach((doc) => toDelete.push(doc._id));

    const deleted = toDelete.length
      ? await University.deleteMany({ _id: { $in: toDelete } })
      : { deletedCount: 0 };

    // --------------------------------------------------
    // UPSERT COUNTRY
    // --------------------------------------------------

    await Country.findOneAndUpdate(
      { name: COUNTRY },
      {
        $set: {
          name: COUNTRY,
          ...countryData,
          unlinkedUniversityRows: unlinked,
          excelSource,
        },
        $setOnInsert: { id: "CTY-DEU" },
      },
      { upsert: true, runValidators: true },
    );

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    console.log("");
    console.log(
      "======================================",
    );
    console.log(
      "Germany Workbook Seed Completed",
    );
    console.log(
      "======================================",
    );
    console.log(`Universities updated: ${updated}`);
    console.log(`Universities created: ${created}`);
    console.log(`Stale/duplicate/header-row universities removed: ${deleted.deletedCount}`);
    console.log(`Country "${COUNTRY}" upserted with Sheets 5-12 data`);
    console.log(
      "======================================",
    );
    console.log("");
  } catch (error) {
    console.error("");
    console.error(
      "GERMANY SEED ERROR:",
    );

    console.error(
      error,
    );

    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();

      console.log(
        "MongoDB connection closed.",
      );
    }
  }
}


seedGermany();
