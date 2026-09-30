require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const University = require("../src/models/University");

const MONGO_URI = process.env.MONGO_URI;

const workbookPath =
  process.env.GERMANY_XLSX_PATH ||
  path.join(__dirname, "..", "data", "Germany(1).xlsx");

if (!MONGO_URI) {
  console.error("MONGO_URI is missing in .env");
  process.exit(1);
}

if (!fs.existsSync(workbookPath)) {
  console.error(`Excel file not found: ${workbookPath}`);
  console.error(
    "Please put Germany(1).xlsx inside Backend/data/"
  );
  process.exit(1);
}


// --------------------------------------------------
// Germany Reference Schema
// Stores complete Excel sheet data
// --------------------------------------------------

const GermanyReferenceSchema = new mongoose.Schema(
  {
    sheetName: {
      type: String,
      required: true,
      unique: true,
    },

    title: {
      type: String,
      default: "",
    },

    headers: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    rows: {
      type: [[mongoose.Schema.Types.Mixed]],
      default: [],
    },

    sourceFile: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const GermanyReference =
  mongoose.models.GermanyReference ||
  mongoose.model(
    "GermanyReference",
    GermanyReferenceSchema
  );


// --------------------------------------------------
// Helper Functions
// --------------------------------------------------

function clean(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}


function splitList(value, separator = ",") {
  return clean(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}


function parseTuition(value) {
  const text = clean(value);

  if (!text) {
    return {
      min: undefined,
      max: undefined,
    };
  }

  const numbers = [...text.matchAll(/\d[\d,]*/g)]
    .map((match) =>
      Number(match[0].replace(/,/g, ""))
    )
    .filter((number) => Number.isFinite(number));

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


function normalizeName(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(
      /university of applied sciences/g,
      "university"
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function createId(index) {
  return `DEU-${String(index).padStart(3, "0")}`;
}


function readSheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
}


function firstNonEmptyRow(rows) {
  return (
    rows.find(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => clean(cell))
    ) || []
  );
}


function getHeaderAndData(rows) {
  const headerIndex = rows.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.some(
        (cell) =>
          clean(cell).toLowerCase() ===
          "university"
      )
  );

  if (headerIndex === -1) {
    return {
      headers: firstNonEmptyRow(rows),
      dataRows: [],
    };
  }

  return {
    headers: rows[headerIndex],
    dataRows: rows.slice(headerIndex + 1),
  };
}


function findRowByUniversity(
  rows,
  universityColumnIndex,
  name
) {
  const target = normalizeName(name);

  return rows.find((row) => {
    const value = row?.[universityColumnIndex];

    return (
      value &&
      normalizeName(value) === target
    );
  });
}


// --------------------------------------------------
// Main Seed Function
// --------------------------------------------------

async function seed() {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected.");

    console.log(
      `Reading Excel: ${workbookPath}`
    );

    const workbook =
      XLSX.readFile(workbookPath);

    console.log(
      `Sheets found: ${workbook.SheetNames.length}`
    );


    // ------------------------------------------------
    // Read ALL 12 sheets
    // ------------------------------------------------

    const allSheetDocuments = [];

    for (const sheetName of workbook.SheetNames) {
      const rows = readSheetRows(
        workbook.Sheets[sheetName]
      );

      const title =
        clean(rows?.[0]?.[0]) ||
        sheetName;

      const headers =
        firstNonEmptyRow(rows);

      allSheetDocuments.push({
        sheetName,
        title,
        headers,
        rows,
        sourceFile:
          path.basename(workbookPath),
      });
    }


    // Delete old reference data
    await GermanyReference.deleteMany({});


    // Insert complete Excel data
    await GermanyReference.insertMany(
      allSheetDocuments
    );

    console.log(
      "All Excel sheets stored in GermanyReference."
    );


    // ------------------------------------------------
    // Read Sheet 2
    // University Main Data
    // ------------------------------------------------

    const sheet2Rows = readSheetRows(
      workbook.Sheets["Sheet2"]
    );

    const sheet2 =
      getHeaderAndData(sheet2Rows);


    // ------------------------------------------------
    // Read Sheet 3
    // University Websites
    // ------------------------------------------------

    const sheet3Rows = readSheetRows(
      workbook.Sheets["Sheet3"]
    );

    const sheet3 =
      getHeaderAndData(sheet3Rows);


    // ------------------------------------------------
    // Read Sheet 4
    // QS Ranking + Website
    // ------------------------------------------------

    const sheet4Rows = readSheetRows(
      workbook.Sheets["Sheet4"]
    );

    const sheet4 =
      getHeaderAndData(sheet4Rows);


    console.log(
      `Sheet 2 rows: ${sheet2.dataRows.length}`
    );

    console.log(
      `Sheet 3 rows: ${sheet3.dataRows.length}`
    );

    console.log(
      `Sheet 4 rows: ${sheet4.dataRows.length}`
    );


    // ------------------------------------------------
    // Website Map - Sheet 3
    // ------------------------------------------------

    const websiteMap = new Map();

    for (const row of sheet3.dataRows) {
      const name = clean(row?.[0]);
      const website = clean(row?.[1]);

      if (
        name &&
        name.toLowerCase() !==
          "university"
      ) {
        websiteMap.set(
          normalizeName(name),
          website
        );
      }
    }


    // ------------------------------------------------
    // Ranking Map - Sheet 4
    // ------------------------------------------------

    const rankingMap = new Map();

    for (const row of sheet4.dataRows) {
      const ranking = clean(row?.[0]);
      const name = clean(row?.[1]);
      const website = clean(row?.[2]);

      if (
        name &&
        name.toLowerCase() !==
          "university"
      ) {
        rankingMap.set(
          normalizeName(name),
          {
            ranking,
            website,
          }
        );
      }
    }


    // ------------------------------------------------
    // Collect University Names
    // ------------------------------------------------

    const universityNames = [];


    // Sheet 2 names
    for (const row of sheet2.dataRows) {
      const name = clean(row?.[0]);

      if (
        name &&
        name.toLowerCase() !==
          "university" &&
        !universityNames.some(
          (existing) =>
            normalizeName(existing) ===
            normalizeName(name)
        )
      ) {
        universityNames.push(name);
      }
    }


    // Sheet 3 names
    for (const row of sheet3.dataRows) {
      const name = clean(row?.[0]);

      if (
        name &&
        name.toLowerCase() !==
          "university" &&
        !universityNames.some(
          (existing) =>
            normalizeName(existing) ===
            normalizeName(name)
        )
      ) {
        universityNames.push(name);
      }
    }


    // Sheet 4 names
    for (const row of sheet4.dataRows) {
      const name = clean(row?.[1]);

      if (
        name &&
        name.toLowerCase() !==
          "university" &&
        !universityNames.some(
          (existing) =>
            normalizeName(existing) ===
            normalizeName(name)
        )
      ) {
        universityNames.push(name);
      }
    }


    console.log(
      `Unique universities found: ${universityNames.length}`
    );


    // ------------------------------------------------
    // Create University Documents
    // ------------------------------------------------

    const universities =
      universityNames.map(
        (name, index) => {
          const sheet2Row =
            findRowByUniversity(
              sheet2.dataRows,
              0,
              name
            );

          const sheet3Row =
            findRowByUniversity(
              sheet3.dataRows,
              0,
              name
            );

          const sheet4Row =
            findRowByUniversity(
              sheet4.dataRows,
              1,
              name
            );


          const city =
            clean(sheet2Row?.[1]);


          const tuition =
            parseTuition(
              sheet2Row?.[2]
            );


          const requirements =
            splitList(
              sheet2Row?.[4],
              ";"
            );


          const popularCourses =
            splitList(
              sheet2Row?.[7],
              ","
            );


          const website =
            clean(sheet3Row?.[1]) ||
            clean(sheet4Row?.[2]) ||
            "";


          const ranking =
            clean(sheet4Row?.[0]) ||
            "";


          const apsRequirement =
            requirements.find(
              (item) =>
                item
                  .toLowerCase()
                  .includes("aps")
            );


          const university = {
            id: createId(index + 1),

            name,

            country: "Germany",

            city,

            ranking:
              ranking || undefined,

            website:
              website || undefined,

            sourceUrl:
              website || undefined,

            tuitionFeeMin:
              tuition.min,

            tuitionFeeMax:
              tuition.max,

            applicationOpens:
              clean(sheet2Row?.[5]) ||
              undefined,

            applicationDeadline:
              clean(sheet2Row?.[6]) ||
              undefined,

            englishRequirement:
              clean(sheet2Row?.[3]) ||
              undefined,

            popularCourses:
              popularCourses.length
                ? popularCourses
                : undefined,

            requirements:
              requirements.length
                ? requirements
                : undefined,

            aps:
              apsRequirement ||
              undefined,

            recommendedIndianPercentage:
              clean(sheet2Row?.[8]) ||
              undefined,
          };


          // Remove undefined values

          Object.keys(university).forEach(
            (key) => {
              if (
                university[key] ===
                undefined
              ) {
                delete university[key];
              }
            }
          );


          return university;
        }
      );


    // ------------------------------------------------
    // Delete Existing Germany Universities
    // ------------------------------------------------

    await University.deleteMany({
      country: "Germany",
    });


    // ------------------------------------------------
    // Insert New Germany Universities
    // ------------------------------------------------

    const insertedUniversities =
      await University.insertMany(
        universities,
        {
          ordered: false,
        }
      );


    console.log("");
    console.log(
      "======================================"
    );

    console.log(
      "Germany Seed Completed"
    );

    console.log(
      "======================================"
    );

    console.log(
      `Excel sheets stored: ${allSheetDocuments.length}`
    );

    console.log(
      `University records inserted: ${insertedUniversities.length}`
    );

    console.log(
      `Sheet 2 rows: ${sheet2.dataRows.length}`
    );

    console.log(
      `Sheet 3 rows: ${sheet3.dataRows.length}`
    );

    console.log(
      `Sheet 4 rows: ${sheet4.dataRows.length}`
    );

    console.log(
      "======================================"
    );

  } catch (error) {
    console.error("");
    console.error(
      "GERMANY SEED ERROR:"
    );
    console.error(error);

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();

    console.log(
      "MongoDB connection closed."
    );
  }
}

seed();