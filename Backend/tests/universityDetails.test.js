// Tests for GET /api/explorer/universities/:id as used by the Universities "View" dialog
//
//   npm test
//
// Runs only when MONGO_TEST_URI points to a LOCAL MongoDB (localhost /
// 127.0.0.1); uses a fresh, uniquely named database and drops only that.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const TEST_URI = process.env.MONGO_TEST_URI;
const isLocal = TEST_URI && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(TEST_URI);
const skip = !TEST_URI
  ? "set MONGO_TEST_URI=mongodb://127.0.0.1:<port> to run"
  : !isLocal
    ? "MONGO_TEST_URI must be a local mongodb:// URI (remote/Atlas refused)"
    : false;

describe("Excel template download", () => {
  const XLSX = require("xlsx");
  const path = require("path");
  const os = require("os");
  const { buildTemplate } = require("../src/services/universityExcelImport");

  const sheetRows = (buffer) => {
    const book = XLSX.read(buffer, { type: "buffer" });
    return { names: book.SheetNames, rows: XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: "" }) };
  };

  test("copies sheet name, headers (in order, duplicates kept) and widths of the source; no data, one sheet", () => {
    const source = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Links", "courses", "University", "Degree", "GPA ", "Degree", "Gap Allowed"],
      ["https://x.example.de", "Data Science", "Alpha University", "MSc", "2.5", "B TECH", "1 year"],
    ]);
    sheet["!cols"] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(source, sheet, "Programmes 2027");
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([["Programme", "Data quality note"]]), "Data Notes");
    const file = path.join(os.tmpdir(), `template-source-${Date.now()}.xlsx`);
    XLSX.writeFile(source, file);

    process.env.EXCEL_TEMPLATE_FILE = file;
    try {
      const { names, rows } = sheetRows(buildTemplate());
      assert.deepEqual(names, ["Programmes 2027"], "one sheet, no Data Notes");
      assert.deepEqual(rows, [["Links", "courses", "University", "Degree", "GPA ", "Degree", "Gap Allowed"]]);
      const book = XLSX.read(buildTemplate(), { type: "buffer", cellStyles: true });
      assert.equal(book.Sheets["Programmes 2027"]["!cols"][0].wch, 30);
    } finally {
      delete process.env.EXCEL_TEMPLATE_FILE;
      fs.rmSync(file, { force: true });
    }
  });

  test("the default template is the header-only copy of the team's workbook", () => {
    const { names, rows } = sheetRows(buildTemplate());
    assert.equal(names.length, 1);
    assert.equal(rows.length, 1, "header row only");
    assert.equal(rows[0][0], "Links");
    assert.equal(rows[0].filter((header) => header === "Degree").length, 2);
  });

  test("a missing template file is a clear error", () => {
    process.env.EXCEL_TEMPLATE_FILE = path.join(os.tmpdir(), "does-not-exist.xlsx");
    try {
      assert.throws(() => buildTemplate(), /template file could not be read/);
    } finally {
      delete process.env.EXCEL_TEMPLATE_FILE;
    }
  });
});

describe("university details against a local MongoDB", { skip }, () => {
  const mongoose = require("mongoose");
  const app = require("../src/app");
  const University = require("../src/models/University");
  const UniversityCourse = require("../src/models/UniversityCourse");

  const dbName = `edupath_details_test_${Date.now()}`;
  const uri = (() => {
    const url = new URL(TEST_URI);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();

  let server;
  let baseUrl;

  before(async () => {
    await mongoose.connect(uri);
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

  test("returns the stored university with every linked course", async () => {
    const university = await University.create({
      id: "UNI-DETAIL",
      name: "Detail University",
      country: "Germany",
      city: "Mainz",
      ranking: "150",
      requirements: ["APS certificate"],
      customFields: { partnerSince: 2019 },
    });
    await UniversityCourse.create([
      { id: "UC-REF", courseName: "Linked by reference", universityId: university._id, sourceRow: { Links: "https://x.example.de", "GPA ": "2.5" }, extraFields: { Remark: "kept" } },
      // Older / seeded records carry only the readable university id
      { id: "UC-EXT", courseName: "Linked by readable id", universityExternalId: "UNI-DETAIL" },
      { id: "UC-OTHER", courseName: "Another university", universityExternalId: "UNI-ELSEWHERE" },
    ]);

    for (const id of ["UNI-DETAIL", String(university._id)]) {
      const response = await fetch(`${baseUrl}/explorer/universities/${id}`);
      assert.equal(response.status, 200);
      const { data } = await response.json();

      assert.equal(data.name, "Detail University");
      assert.equal(data.ranking, "150");
      assert.deepEqual(data.requirements, ["APS certificate"]);
      assert.deepEqual(data.customFields, { partnerSince: 2019 });
      assert.deepEqual(data.programmes.map((course) => course.id).sort(), ["UC-EXT", "UC-REF"]);
      assert.equal(data.programmeCount, 2);
    }

    assert.equal((await fetch(`${baseUrl}/explorer/universities/UNI-MISSING`)).status, 404);

    // Uploaded Excel rows only on request (Universities "View")
    const plainDetails = (await (await fetch(`${baseUrl}/explorer/universities/UNI-DETAIL`)).json()).data;
    assert.equal(plainDetails.programmes.find((course) => course.id === "UC-REF").sourceRow, undefined);
    const withSource = (await (await fetch(`${baseUrl}/explorer/universities/UNI-DETAIL?include=source`)).json()).data;
    const ref = withSource.programmes.find((course) => course.id === "UC-REF");
    assert.deepEqual(ref.sourceRow, { Links: "https://x.example.de", "GPA ": "2.5" });
    assert.deepEqual(ref.extraFields, { Remark: "kept" });
    assert.equal(ref.searchTags, undefined, "internal search fields stay hidden");

    // Courses list: a course linked only by the readable id shows its university name
    const list = await (await fetch(`${baseUrl}/university-courses?page=1&limit=50`)).json();
    const byId = new Map(list.data.map((course) => [course.id, course]));
    assert.equal(byId.get("UC-EXT").universityName, "Detail University");
    assert.equal(byId.get("UC-REF").universityId.name, "Detail University");
    assert.equal(byId.get("UC-OTHER").universityName, undefined, "unknown university stays unlinked");
    const single = await (await fetch(`${baseUrl}/university-courses/UC-EXT`)).json();
    assert.equal(single.data.universityName, "Detail University");

    // Universities list / single: course records linked by reference or readable id
    const universities = await (await fetch(`${baseUrl}/universities`)).json();
    const detail = universities.data.find((item) => item.id === "UNI-DETAIL");
    assert.equal(detail.courseCount, 2);
    assert.deepEqual(detail.courseNames, ["Linked by readable id", "Linked by reference"]);
    const one = await (await fetch(`${baseUrl}/universities/UNI-DETAIL`)).json();
    assert.equal(one.data.courseCount, 2);
  });
});
