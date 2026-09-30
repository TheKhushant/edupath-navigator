require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const University = require("../src/models/University");

const MONGO_URI = process.env.MONGO_URI;

const excelPath =
  process.env.GERMANY_XLSX_PATH ||
  path.join(
    __dirname,
    "..",
    "data",
    "Germany(1).xlsx",
  );


// ======================================================
// CHECK ENVIRONMENT
// ======================================================

if (!MONGO_URI) {
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


// ======================================================
// MAIN SEED
// ======================================================

async function seedGermanySheet2() {
  try {
    console.log("");
    console.log(
      "======================================",
    );
    console.log(
      "Germany Sheet2 Seed Started",
    );
    console.log(
      "======================================",
    );

    // --------------------------------------------------
    // CONNECT MONGODB
    // --------------------------------------------------

    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log(
      "MongoDB connected.",
    );


    // --------------------------------------------------
    // READ EXCEL
    // --------------------------------------------------

    console.log("");
    console.log(
      `Reading Excel: ${excelPath}`,
    );

    const workbook =
      XLSX.readFile(excelPath);

    console.log(
      `Sheets found: ${workbook.SheetNames.length}`,
    );


    // --------------------------------------------------
    // ONLY SHEET 2
    // --------------------------------------------------

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


    console.log(
      `Sheet2 data rows found: ${rows.length}`,
    );


    // --------------------------------------------------
    // CLEAR EXISTING GERMANY UNIVERSITIES
    // --------------------------------------------------

    console.log("");
    console.log(
      "Removing existing Germany universities...",
    );

    const deleted =
      await University.deleteMany({
        country: "Germany",
      });

    console.log(
      `Existing Germany universities removed: ${deleted.deletedCount}`,
    );


    // --------------------------------------------------
    // CREATE UNIVERSITY DATA
    // --------------------------------------------------

    const universities = [];

    let index = 1;


    for (const row of rows) {
      const universityName =
        clean(row["University"]);

      // Skip empty rows
      if (!universityName) {
        continue;
      }


      const city =
        clean(row["City"]);

      const annualTuitionFee =
        clean(
          row[
            "Annual Tuition Fee (EUR)"
          ],
        );

      const ielts =
        clean(row["IELTS"]);

      const otherRequirements =
        clean(
          row["Other Requirements"],
        );

      const applicationOpens =
        clean(
          row["Application Opens"],
        );

      const applicationDeadline =
        clean(
          row["Application Deadline"],
        );

      const majorCourses =
        clean(
          row["Major Courses"],
        );

      const recommendedIndianPercentage =
        clean(
          row[
            "Recommended Indian %"
          ],
        );


      // ------------------------------------------------
      // TUITION
      // ------------------------------------------------

      const tuition =
        parseTuition(
          annualTuitionFee,
        );


      // ------------------------------------------------
      // COURSES
      // ------------------------------------------------

      const popularCourses =
        splitCourses(
          majorCourses,
        );


      // ------------------------------------------------
      // REQUIREMENTS
      // ------------------------------------------------

      const requirements =
        splitRequirements(
          otherRequirements,
        );


      // ------------------------------------------------
      // APS
      // ------------------------------------------------

      const aps =
        requirements.find(
          (requirement) =>
            requirement
              .toLowerCase()
              .includes("aps"),
        );


      // ------------------------------------------------
      // EXACT SHEET2 DATA
      // ------------------------------------------------

      const sheet2Data = {
        University:
          universityName,

        City:
          city,

        "Annual Tuition Fee (EUR)":
          annualTuitionFee,

        IELTS:
          ielts,

        "Other Requirements":
          otherRequirements,

        "Application Opens":
          applicationOpens,

        "Application Deadline":
          applicationDeadline,

        "Major Courses":
          majorCourses,

        "Recommended Indian %":
          recommendedIndianPercentage,
      };


      // ------------------------------------------------
      // UNIVERSITY DOCUMENT
      // ------------------------------------------------

      const university = {
        id: createUniversityId(index),

        name:
          universityName,

        country:
          "Germany",

        city:
          city,

        annualTuitionFee:
          annualTuitionFee,

        tuitionFeeMin:
          tuition.min,

        tuitionFeeMax:
          tuition.max,

        englishRequirement:
          ielts,

        requirements:
          requirements,

        aps:
          aps || undefined,

        applicationOpens:
          applicationOpens,

        applicationDeadline:
          applicationDeadline,

        popularCourses:
          popularCourses,

        recommendedIndianPercentage:
          recommendedIndianPercentage,

        // Complete original Sheet2 information
        sheet2Data:
          sheet2Data,
      };


      // Remove undefined properties

      Object.keys(university).forEach(
        (key) => {
          if (
            university[key] ===
            undefined
          ) {
            delete university[key];
          }
        },
      );


      universities.push(
        university,
      );

      index++;
    }


    // --------------------------------------------------
    // INSERT INTO MONGODB
    // --------------------------------------------------

    console.log("");
    console.log(
      `Inserting ${universities.length} universities...`,
    );


    const inserted =
      await University.insertMany(
        universities,
        {
          ordered: true,
        },
      );


    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    console.log("");
    console.log(
      "======================================",
    );

    console.log(
      "Germany Sheet2 Seed Completed",
    );

    console.log(
      "======================================",
    );

    console.log(
      `Sheet2 rows read: ${rows.length}`,
    );

    console.log(
      `Universities inserted: ${inserted.length}`,
    );

    console.log(
      "Country: Germany",
    );

    console.log(
      "Source: Sheet2 only",
    );

    console.log(
      "======================================",
    );

    console.log("");


  } catch (error) {
    console.error("");
    console.error(
      "GERMANY SHEET2 SEED ERROR:",
    );

    console.error(
      error,
    );

    process.exitCode = 1;

  } finally {
    await mongoose.disconnect();

    console.log(
      "MongoDB connection closed.",
    );
  }
}


seedGermanySheet2();