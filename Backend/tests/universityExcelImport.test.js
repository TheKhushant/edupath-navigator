// Tests for the University Excel import (preview -> column selection/mapping -> confirm)
//
//   npm test
//
// Runs only when MONGO_TEST_URI points to a LOCAL MongoDB (localhost /
// 127.0.0.1); uses a fresh, uniquely named database and drops only that.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");

const TEST_URI = process.env.MONGO_TEST_URI;
const isLocal = TEST_URI && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(TEST_URI);
const skip = !TEST_URI
  ? "set MONGO_TEST_URI=mongodb://127.0.0.1:<port> to run"
  : !isLocal
    ? "MONGO_TEST_URI must be a local mongodb:// URI (remote/Atlas refused)"
    : false;

/** Workbook buffer from { sheetName: rows[][] }. */
function workbook(sheets) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

describe("university Excel import against a local MongoDB", { skip }, () => {
  const mongoose = require("mongoose");
  const app = require("../src/app");
  const University = require("../src/models/University");
  const ExcelImport = require("../src/models/ExcelImport");
  const { invalidateDictionary } = require("../src/services/searchTagDictionary");

  const dbName = `edupath_excel_test_${Date.now()}`;
  const uri = (() => {
    const url = new URL(TEST_URI);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();

  let server;
  let baseUrl;

  /** POST like the frontend: optional selections JSON in front of the workbook bytes. */
  async function upload(step, buffer, { selections, query = {} } = {}) {
    const params = new URLSearchParams({ fileName: "universities.xlsx", mode: "skip", defaultCountry: "", ...query });
    let body = buffer;

    if (selections) {
      const json = Buffer.from(JSON.stringify(selections), "utf8");
      params.set("selectionsLength", String(json.length));
      body = Buffer.concat([json, buffer]);
    }

    const response = await fetch(`${baseUrl}/universities/import/${step}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body,
    });
    return { status: response.status, body: await response.json() };
  }

  const scanAndImport = async (buffer, selections) => {
    const preview = await upload("preview", buffer, { selections });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const result = await upload("confirm", buffer, {
      selections,
      query: { expectedHash: preview.body.data.sha256 },
    });
    return { preview: preview.body.data, result };
  };

  /** Selections equal to the automatic mapping, then patched per header. */
  const selectionsFrom = (preview, sheetName, patch = {}) => ({
    sheets: [
      {
        name: sheetName,
        columns: preview.sheets
          .find((sheet) => sheet.name === sheetName)
          .columns.filter((column) => column.header)
          .map((column) => ({
            index: column.index,
            include: true,
            field: column.status === "mapped" ? column.mappedTo : column.autoField ?? "",
            ...patch[column.header],
          })),
      },
    ],
  });

  const standard = [
    ["University", "Country", "City", "Major Courses", "Official Website"],
    ["Alpha University", "Germany", "Berlin", "Computer Science, AI", "https://alpha.example.de"],
    ["Beta University", "Germany", "Hamburg", "Business", "https://beta.example.de"],
  ];

  before(async () => {
    await mongoose.connect(uri);
    // One search concept, to check that imported universities are still tagged
    await require("../src/models/SearchTag").create({ name: "Computer Science", aliases: ["CS"] });
    invalidateDictionary();
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    server?.close();
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });

  test("preview without selections: automatic mapping as before, plus the field catalog", async () => {
    const { status, body } = await upload("preview", workbook({ Universities: standard }));
    assert.equal(status, 200);

    const preview = body.data;
    const sheet = preview.sheets[0];
    assert.equal(sheet.type, "universities");
    assert.deepEqual(
      sheet.columns.map((column) => [column.header, column.status, column.mappedTo]),
      [
        ["University", "mapped", "name"],
        ["Country", "mapped", "country"],
        ["City", "mapped", "city"],
        ["Major Courses", "mapped", "popularCourses"],
        ["Official Website", "mapped", "website"],
      ],
    );
    assert.equal(preview.canImport, true);
    assert.equal(preview.hasColumnSelections, false);
    assert.equal(preview.mappingErrors, 0);
    assert.ok(preview.fields.some((field) => field.key === "englishRequirement" && field.dbField === "englishRequirement"));
    assert.ok(preview.fields.some((field) => field.key === "extraFields"));
    assert.equal(await University.countDocuments(), 0, "preview writes nothing");
  });

  test("unchecked columns are not imported anywhere; selected columns are", async () => {
    const buffer = workbook({ Universities: standard });
    const auto = (await upload("preview", buffer)).body.data;
    const selections = selectionsFrom(auto, "Universities", { City: { include: false } });

    const { preview, result } = await scanAndImport(buffer, selections);
    assert.equal(preview.hasColumnSelections, true);
    assert.equal(preview.sheets[0].columns.find((column) => column.header === "City").status, "excluded");
    assert.equal(result.status, 201, JSON.stringify(result.body));

    const alpha = await University.findOne({ name: "Alpha University" }).lean();
    assert.equal(alpha.city, undefined);
    assert.ok(!JSON.stringify(alpha).includes("Berlin"), "excluded values are not in sourceRow/extraFields");
    assert.deepEqual(alpha.popularCourses, ["Computer Science", "AI"]);
    // Existing processing still runs: search tags from popular courses
    assert.ok(alpha.searchTags.includes("computer science"));

    const log = await ExcelImport.findOne({ importId: result.body.data.importId }).lean();
    assert.ok(!JSON.stringify(log.preservedRows ?? []).includes("Hamburg"));
    const city = log.options.columnMapping[0].columns.find((column) => column.header === "City");
    assert.deepEqual(city, { header: "City", included: false, field: null });
  });

  test("unknown headers can be mapped manually", async () => {
    const buffer = workbook({
      Data: [
        ["Hochschule", "Land", "Stadt", "Notizen"],
        ["Gamma University", "Germany", "Munich", "Partner since 2020"],
      ],
    });

    const auto = (await upload("preview", buffer)).body.data;
    assert.equal(auto.sheets[0].type, "unrecognized");
    assert.equal(auto.canImport, false);

    const selections = selectionsFrom(auto, "Data", {
      Hochschule: { field: "name" },
      Land: { field: "country" },
      Stadt: { field: "city" },
      Notizen: { field: "extraFields" },
    });
    const { preview, result } = await scanAndImport(buffer, selections);

    assert.equal(preview.sheets[0].type, "universities");
    assert.equal(result.status, 201, JSON.stringify(result.body));

    const gamma = await University.findOne({ name: "Gamma University" }).lean();
    assert.equal(gamma.country, "Germany");
    assert.equal(gamma.city, "Munich");
    assert.deepEqual(gamma.extraFields, { Notizen: "Partner since 2020" });
  });

  test("a selected column without mapping blocks the import", async () => {
    const buffer = workbook({
      Universities: [
        ["University", "Country", "Comments"],
        ["Delta University", "Germany", "something"],
      ],
    });
    const auto = (await upload("preview", buffer)).body.data;
    const selections = selectionsFrom(auto, "Universities", { Comments: { field: "" } });

    const { preview, result } = await scanAndImport(buffer, selections);
    assert.equal(preview.canImport, false);
    assert.equal(preview.mappingErrors, 1);
    assert.ok(preview.issues.some((issue) => issue.code === "unmapped_column" && issue.column === "Comments"));
    assert.equal(result.status, 400);
    assert.equal(await University.countDocuments({ name: "Delta University" }), 0);

    // Unchecking it (or choosing Additional info) makes the file importable
    const fixed = selectionsFrom(auto, "Universities", { Comments: { include: false } });
    const second = await scanAndImport(buffer, fixed);
    assert.equal(second.result.status, 201);
  });

  test("duplicate mappings and fields the sheet does not import are blocked", async () => {
    const buffer = workbook({
      Universities: [
        ["University", "Country", "Town", "City", "Rank"],
        ["Epsilon University", "Germany", "Bonn", "Bonn", "5"],
      ],
    });
    const auto = (await upload("preview", buffer)).body.data;

    const duplicate = selectionsFrom(auto, "Universities", { Town: { field: "city" }, Rank: { include: false } });
    const first = (await upload("preview", buffer, { selections: duplicate })).body.data;
    assert.ok(first.issues.some((issue) => issue.code === "duplicate_mapping"));
    assert.equal(first.canImport, false);

    const unused = selectionsFrom(auto, "Universities", { Town: { include: false }, Rank: { field: "rank" } });
    const second = (await upload("preview", buffer, { selections: unused })).body.data;
    assert.ok(second.issues.some((issue) => issue.code === "field_not_used" && issue.column === "Rank"));
    assert.equal(second.canImport, false);
  });

  test("unmapped columns on sheets that are not imported do not block the file", async () => {
    const buffer = workbook({
      Universities: [
        ["University", "Country"],
        ["Zeta University", "Germany"],
      ],
      Notes: [["Remark", "Owner"], ["call back", "Asha"]],
    });
    const auto = (await upload("preview", buffer)).body.data;
    const selections = {
      sheets: [
        ...selectionsFrom(auto, "Universities").sheets,
        { name: "Notes", columns: [{ index: 0, include: true, field: "" }, { index: 1, include: true, field: "" }] },
      ],
    };

    const { preview, result } = await scanAndImport(buffer, selections);
    assert.equal(preview.mappingErrors, 0);
    assert.ok(preview.issues.some((issue) => issue.code === "mapping_ignored" && issue.sheet === "Notes"));
    assert.equal(result.status, 201);
  });

  test("invalid selections are rejected safely", async () => {
    const buffer = workbook({ Universities: standard });

    const badField = await upload("preview", buffer, {
      selections: { sheets: [{ name: "Universities", columns: [{ index: 0, include: true, field: "$where" }] }] },
    });
    assert.equal(badField.status, 400);
    assert.match(badField.body.message, /Unsupported database field/);

    const badSheet = await upload("preview", buffer, { selections: { sheets: [{ name: "Missing", columns: [] }] } });
    assert.equal(badSheet.status, 400);

    const badIndex = await upload("preview", buffer, {
      selections: { sheets: [{ name: "Universities", columns: [{ index: 40, include: true, field: "" }] }] },
    });
    assert.equal(badIndex.status, 400);

    const notJson = await fetch(`${baseUrl}/universities/import/preview?fileName=a.xlsx&selectionsLength=3`, {
      method: "POST",
      body: Buffer.concat([Buffer.from("{x}"), buffer]),
    });
    assert.equal(notJson.status, 400);

    const tooLong = await fetch(`${baseUrl}/universities/import/preview?fileName=a.xlsx&selectionsLength=99999999`, {
      method: "POST",
      body: buffer,
    });
    assert.equal(tooLong.status, 400);
  });

  test("confirm without selections still imports exactly as before", async () => {
    const buffer = workbook({
      Universities: [
        ["University", "Country", "City", "Extra Column"],
        ["Eta University", "Germany", "Cologne", "kept"],
      ],
    });
    const preview = (await upload("preview", buffer)).body.data;
    const result = await upload("confirm", buffer, { query: { expectedHash: preview.sha256 } });

    assert.equal(result.status, 201);
    const eta = await University.findOne({ name: "Eta University" }).lean();
    assert.equal(eta.city, "Cologne");
    assert.deepEqual(eta.extraFields, { "Extra Column": "kept" });
  });

  // ---------- Course sheets (one course per row) ----------

  const UniversityCourse = require("../src/models/UniversityCourse");

  // The 31 course columns (with the source's spelling), "Degree" twice
  const courseHeaders = [
    "Links", "courses", "University", "Country", "city", "semesters", "intake", "Tution fees", "Course Category",
    "Annual Tution Fee", "IELTS", "Other Requirements", "Application Opens", "Application Deadline", "GPA ", "Category",
    "Degree", "Language of Instruction", "TOEFL", "German Requirement", "Academic Background Required",
    "Recommended Indian %", "ECTS Required", "GRE / GMAT", "Work Experience", "Backlogs Allowed", "Application Route",
    "APS Required", "Major Courses", "Difficulty", "Degree", "Gap Allowed",
  ];
  const courseRow = (course, university, overrides = {}) => {
    const values = {
      Links: `https://courses.example.de/${course.replace(/\W+/g, "-").toLowerCase()}`,
      courses: course, University: university, Country: "Germany", city: "Kassel", semesters: "4 semesters",
      intake: "Winter semester", "Tution fees": "No tuition fees", "Course Category": "Computer Science",
      "Annual Tution Fee": "€0 tuition/year; semester contribution approx. €330", IELTS: "IELTS Academic 6.5",
      "Other Requirements": "CV; Motivation letter", "Application Opens": "1 December",
      "Application Deadline": "15 July", "GPA ": "2.5 German grade", Category: "Informatics",
      "Degree:1": "Master of Science (MSc)", "Language of Instruction": "English", TOEFL: "TOEFL iBT 88",
      "German Requirement": "None", "Academic Background Required": "Bachelor in CS", "Recommended Indian %": "70%",
      "ECTS Required": "180 ECTS", "GRE / GMAT": "Not required", "Work Experience": "Not required",
      "Backlogs Allowed": "Up to 5", "Application Route": "uni-assist", "APS Required": "Yes",
      "Major Courses": "Algorithms; Machine learning; Databases", Difficulty: "medium ", "Degree:2": "B TECH",
      "Gap Allowed": "2 years",
      ...overrides,
    };
    let degree = 0;
    return courseHeaders.map((header) => (header === "Degree" ? values[`Degree:${++degree}`] : values[header]));
  };

  /** Selections like the frontend defaults: mapped columns kept, everything else needs a choice. */
  const defaultsFrom = (preview, sheetName, patch = {}) => ({
    sheets: [
      {
        name: sheetName,
        columns: preview.sheets
          .find((sheet) => sheet.name === sheetName)
          .columns.filter((column) => column.header)
          .map((column) => ({
            index: column.index,
            include: true,
            field: column.status === "mapped" ? column.mappedTo : "",
            ...(patch[column.index] ?? patch[column.header]),
          })),
      },
    ],
  });

  test("header variants map semantically; semester fees are never read as annual tuition", () => {
    const { matchHeader, parseTuitionAmount } = require("../src/services/universityExcelImport");
    const key = (header) => {
      const match = matchHeader(header);
      return match && !match.suggestOnly && !match.ambiguous ? match.keys[0] : undefined;
    };

    assert.equal(key("Tuition Fee"), "tuitionFee");
    assert.equal(key("Tuition Fees"), "tuitionFee");
    assert.equal(key("Tution fees"), "tuitionFee");
    assert.equal(key("Annual Tuition Fee"), "annualTuitionFee");
    assert.equal(key("Annual Tution Fee"), "annualTuitionFee");
    assert.equal(key("Tuition fee per year (EUR)"), "annualTuitionFee");
    assert.equal(key("IELTS Score"), "englishRequirement");
    assert.equal(key("IELTS (Academic)"), "englishRequirement");
    assert.equal(key("GRE / GMAT"), "gre");
    assert.equal(key("Recommended Indian %"), "recommendedIndianPercentage");
    assert.equal(key("Course / Programme"), "courseName");
    assert.equal(matchHeader("Tution fees").confidence, "medium");
    assert.equal(matchHeader("IELTS").confidence, "high");

    for (const header of ["Semester Fee", "Tuition fee per semester", "Semester contribution (EUR)"]) {
      assert.equal(key(header), undefined, header);
      assert.ok(!matchHeader(header).keys.includes("annualTuitionFee"), header);
    }
    assert.equal(key("Semesters"), "duration");

    assert.ok(matchHeader("courses").ambiguous, "courses = course name or list of courses");
    assert.equal(matchHeader("Notizen"), undefined);

    assert.deepEqual(parseTuitionAmount("€0 tuition/year; semester contribution approx. €330"), { min: 0, max: 0 });
    assert.deepEqual(parseTuitionAmount("1,500-3,000 per year"), { min: 1500, max: 3000 });
    assert.equal(parseTuitionAmount("$20,000").min, undefined);
  });

  test("course sheet: second Degree must be resolved, then courses and universities are imported", async () => {
    const buffer = workbook({
      Programmes: [
        courseHeaders,
        courseRow("Data Science", "Kappa University "),
        courseRow("Applied Computer Science", "Kappa University", { "Degree:1": "Master of Engineering (MEng)" }),
        [],
      ],
    });

    const auto = (await upload("preview", buffer)).body.data;
    const sheet = auto.sheets[0];
    assert.equal(sheet.type, "courses");
    assert.deepEqual(auto.detected, { universities: true, courses: true });

    const byIndex = (index) => sheet.columns[index];
    assert.equal(byIndex(1).mappedTo, "courseName", "\"courses\" next to \"Major Courses\" is the course name");
    assert.equal(byIndex(7).mappedTo, "tuitionFee");
    assert.equal(byIndex(7).confidence, "medium");
    assert.equal(byIndex(9).mappedTo, "annualTuitionFee");
    assert.equal(byIndex(16).mappedTo, "degree");
    assert.equal(byIndex(28).mappedTo, "popularCourses");
    assert.equal(byIndex(30).status, "suggested");
    assert.equal(byIndex(30).suggestionField, "requiredDegree");
    assert.deepEqual(byIndex(30).samples, ["B TECH"]);
    assert.equal(sheet.columns.filter((column) => column.status === "mapped").length, 31);
    assert.ok(auto.fields.find((field) => field.key === "englishRequirement").dbFields.courses.endsWith("ielts"));

    // Frontend defaults: the ambiguous column has no field yet -> blocked
    const blocked = await scanAndImport(buffer, defaultsFrom(auto, "Programmes"));
    assert.equal(blocked.preview.mappingErrors, 1);
    assert.equal(blocked.preview.sheets[0].columns[30].suggestionField, "requiredDegree", "suggestion kept after the user scan");
    assert.deepEqual(blocked.preview.sheets[0].columns[30].candidates, ["degree", "requiredDegree"]);
    assert.equal(blocked.result.status, 400);
    assert.equal(await UniversityCourse.countDocuments(), 0);

    const { preview, result } = await scanAndImport(buffer, defaultsFrom(auto, "Programmes", { 30: { field: "requiredDegree" } }));
    assert.equal(preview.summary.willCreate, 1, "one university for both rows");
    assert.equal(preview.summary.willCreateCourses, 2);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.data.summary.coursesImported, 2);
    assert.equal(result.body.data.summary.imported, 1);

    const university = await University.findOne({ name: "Kappa University" }).lean();
    assert.equal(university.country, "Germany");
    assert.equal(university.city, "Kassel");
    assert.equal(university.popularCourses.length, 0, "course details are not copied onto the university");

    const course = await UniversityCourse.findOne({ courseName: "Data Science" }).lean();
    assert.equal(String(course.universityId), String(university._id));
    assert.equal(course.universityExternalId, university.id);
    assert.equal(course.sourceUrl, "https://courses.example.de/data-science");
    assert.equal(course.degree, "Master of Science (MSc)");
    assert.equal(course.requiredDegree, "B TECH");
    assert.equal(course.tuitionFee, "No tuition fees");
    assert.equal(course.annualTuitionFee, "€0 tuition/year; semester contribution approx. €330");
    assert.equal(course.tuitionMin, 0);
    assert.equal(course.tuitionMax, 0);
    assert.equal(course.ielts, "IELTS Academic 6.5");
    assert.equal(course.toefl, "TOEFL iBT 88");
    assert.equal(course.minimumGpa, "2.5 German grade");
    assert.equal(course.applicationStartDate, "1 December");
    assert.equal(course.subjectArea, "Computer Science");
    assert.equal(course.category, "Informatics");
    assert.equal(course.eligibility, "Bachelor in CS");
    assert.equal(course.ectsRequired, "180 ECTS");
    assert.equal(course.applicationMethod, "uni-assist");
    assert.equal(course.difficulty, "Medium");
    assert.deepEqual(course.requirements, ["CV", "Motivation letter"]);
    assert.deepEqual(course.majorCourses, ["Algorithms", "Machine learning", "Databases"]);
    for (const field of ["duration", "intake", "language", "germanRequirement", "gre", "workExperience", "backlogsAllowed", "apsRequired", "gapAllowed", "recommendedIndianPercentage"]) {
      assert.ok(course[field], `${field} is stored`);
    }
    const tagged = await UniversityCourse.findOne({ courseName: "Applied Computer Science" }).lean();
    assert.ok(tagged.searchTags.includes("computer science"), "course search tags are built");

    const log = await ExcelImport.findOne({ importId: result.body.data.importId }).lean();
    assert.equal(log.createdCourseIds.length, 2);

    // Same file again: nothing duplicated, existing courses skipped
    const again = await scanAndImport(buffer, defaultsFrom(auto, "Programmes", { 30: { field: "requiredDegree" } }));
    assert.equal(again.preview.summary.willCreate, 0);
    assert.equal(again.preview.summary.willSkipCourses, 2);
    assert.equal(again.preview.canImport, false);
    assert.equal(await UniversityCourse.countDocuments({ universityId: university._id }), 2);

    // Update mode: needs confirmation, then writes non-empty values only
    const changed = workbook({
      Programmes: [courseHeaders, courseRow("Data Science", "Kappa University", { "Gap Allowed": "", IELTS: "IELTS Academic 7.0" })],
    });
    const updateSelections = defaultsFrom(auto, "Programmes", { 30: { field: "requiredDegree" } });
    const updatePreview = (await upload("preview", changed, { selections: updateSelections, query: { mode: "update" } })).body.data;
    assert.equal(updatePreview.summary.willUpdateCourses, 1);
    const unconfirmed = await upload("confirm", changed, { selections: updateSelections, query: { mode: "update", expectedHash: updatePreview.sha256 } });
    assert.equal(unconfirmed.status, 400);
    const confirmed = await upload("confirm", changed, {
      selections: updateSelections,
      query: { mode: "update", expectedHash: updatePreview.sha256, confirmOverwrite: "true" },
    });
    assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.data.summary.coursesUpdated, 1);
    const updated = await UniversityCourse.findOne({ _id: course._id }).lean();
    assert.equal(updated.ielts, "IELTS Academic 7.0");
    assert.equal(updated.gapAllowed, "2 years", "empty cells do not clear existing values");
  });

  test("courses link to existing universities, report failed rows and keep extra columns", async () => {
    await University.create({ id: "UNI-LAMBDA", name: "Lambda University", country: "Germany", city: "Bonn" });

    const date = new Date(Date.UTC(2027, 0, 15));
    const buffer = workbook({
      Courses: [
        ["University", "Country", "Course Name", "Degree", "Application Deadline", "Semester Fee", "Internal Note"],
        ["Lambda University", "Germany", "Physics", "MSc", date, "€350", "keep me"],
        ["Mu University", "", "Chemistry", "MSc", "", "", ""],
        ["", "Germany", "Biology", "MSc", "", "", ""],
      ],
    });

    const auto = (await upload("preview", buffer)).body.data;
    const columns = auto.sheets[0].columns;
    assert.equal(columns[5].status, "unexpected", "semester fee is not mapped automatically");
    assert.match(columns[5].matchReason, /semester/i);

    const selections = defaultsFrom(auto, "Courses", { "Semester Fee": { field: "extraFields" }, "Internal Note": { field: "extraFields" } });
    const { preview, result } = await scanAndImport(buffer, selections);

    assert.equal(preview.summary.willCreate, 0, "no university created for the linked course");
    assert.equal(preview.summary.courses.invalid, 2);
    assert.ok(preview.universities.some((university) => university.action === "link" && university.existingId === "UNI-LAMBDA"));
    assert.equal(result.status, 201, JSON.stringify(result.body));

    const failed = result.body.data.failedRows;
    assert.ok(failed.some((row) => row.row === 3 && /cannot be created without a country/.test(row.message)));
    assert.ok(failed.some((row) => row.row === 4 && /University name is missing/.test(row.message)));
    assert.equal(result.body.data.summary.invalid, 2);

    const lambda = await University.findOne({ id: "UNI-LAMBDA" }).lean();
    const physics = await UniversityCourse.findOne({ courseName: "Physics" }).lean();
    assert.equal(String(physics.universityId), String(lambda._id));
    assert.equal(physics.applicationDeadline, "2027-01-15");
    assert.deepEqual(physics.extraFields, { "Semester Fee": "€350", "Internal Note": "keep me" });
    assert.equal(await University.countDocuments({ name: "Mu University" }), 0);
  });

  test("university sheets keep their old meaning of Tuition Fee and Courses", async () => {
    const buffer = workbook({
      Universities: [
        ["University", "Country", "Tuition Fee", "Courses"],
        ["Nu University", "Germany", "1000-2000", "Computer Science, Data Science"],
        ["Xi University", "Germany", "0", "Business, Management"],
      ],
    });

    const preview = (await upload("preview", buffer)).body.data;
    const sheet = preview.sheets[0];
    assert.equal(sheet.type, "universities");
    assert.equal(sheet.columns[2].mappedTo, "annualTuitionFee");
    assert.equal(sheet.columns[3].mappedTo, "popularCourses");

    const result = await upload("confirm", buffer, { query: { expectedHash: preview.sha256 } });
    assert.equal(result.status, 201);
    const nu = await University.findOne({ name: "Nu University" }).lean();
    assert.equal(nu.tuitionFeeMax, 2000);
    assert.deepEqual(nu.popularCourses, ["Computer Science", "Data Science"]);
  });
});
