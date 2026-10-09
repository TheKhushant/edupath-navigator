// Tests for custom fields created during the University Excel import, and
// for import progress reporting.
//
//   npm test
//
// The unit tests always run. The import tests run only when MONGO_TEST_URI
// points to a LOCAL MongoDB (localhost / 127.0.0.1); they use a fresh,
// uniquely named database and drop only that.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");

const {
  keyFromLabel,
  definitionError,
  convertCell,
  isValidCustomFields,
  reservedKeysFor,
} = require("../src/services/customFields");

describe("custom field rules", () => {
  test("keys are derived from labels and validated", () => {
    assert.equal(keyFromLabel("Scholarship Amount (EUR)"), "scholarshipAmountEur");
    assert.equal(keyFromLabel("Über-Fee"), "uberFee");
    assert.equal(keyFromLabel("2024 Intake"), "intake");
    assert.equal(keyFromLabel("3rd Party Fee"), "rdPartyFee");

    const University = require("../src/models/University");
    const UniversityCourse = require("../src/models/UniversityCourse");
    const reserved = { university: reservedKeysFor(University, ["name"]), course: reservedKeysFor(UniversityCourse) };
    const valid = { entity: "university", key: "partnerSince", label: "Partner Since", type: "number" };

    assert.equal(definitionError(valid, reserved), undefined);
    assert.match(definitionError({ ...valid, key: "country" }, reserved), /built-in/);
    assert.match(definitionError({ ...valid, key: "scholarship" }, reserved), /built-in/, "existing University field");
    assert.match(definitionError({ ...valid, key: "Country" }, reserved), /camelCase/);
    assert.match(definitionError({ ...valid, key: "customFields" }, reserved), /built-in/);
    assert.match(definitionError({ ...valid, key: "constructor" }, reserved), /built-in/);
    assert.match(definitionError({ ...valid, key: "$where" }, reserved), /camelCase/);
    assert.match(definitionError({ ...valid, key: "a.b" }, reserved), /camelCase/);
    assert.match(definitionError({ ...valid, type: "function" }, reserved), /type must be/);
    assert.match(definitionError({ ...valid, entity: "student" }, reserved), /entity/);
    assert.match(definitionError({ ...valid, label: "x".repeat(61) }, reserved), /longer/);
    assert.match(definitionError({ ...valid, key: "courseName", entity: "course" }, reserved), /built-in/);
  });

  test("cells are converted to the field type; invalid values are rejected", () => {
    const cell = (text, extra = {}) => ({ text, type: "s", isDate: false, ...extra });

    assert.deepEqual(convertCell("number", cell("1,500.50")), { value: 1500.5 });
    assert.ok(convertCell("number", cell("about 5")).error);
    assert.deepEqual(convertCell("boolean", cell("Yes")), { value: true });
    assert.deepEqual(convertCell("boolean", cell("0")), { value: false });
    assert.ok(convertCell("boolean", cell("maybe")).error);
    assert.equal(convertCell("date", cell("15/01/2027")).value.toISOString(), "2027-01-15T00:00:00.000Z");
    assert.equal(convertCell("date", cell("1/15/27", { isDate: true, serial: 46402 })).value.toISOString(), "2027-01-15T00:00:00.000Z");
    assert.ok(convertCell("date", cell("31/02/2027")).error);
    assert.deepEqual(convertCell("array", cell("a; b ;c")), { value: ["a", "b", "c"] });
    assert.deepEqual(convertCell("object", cell('{"amount": 500, "currency": "EUR"}')), { value: { amount: 500, currency: "EUR" } });
    assert.ok(convertCell("object", cell('{"$gt": 1}')).error, "operator keys are refused");
    assert.ok(convertCell("object", cell('{"a.b": 1}')).error, "dotted keys are refused");
    assert.ok(convertCell("object", cell("[1,2]")).error, "only objects");
    assert.ok(convertCell("object", cell("{nope")).error);
  });

  test("the schema guard accepts only simple, safe customFields", () => {
    assert.ok(isValidCustomFields(undefined));
    assert.ok(isValidCustomFields({ scholarship: 500, partner: true, start: new Date(), tags: ["a"], fee: { amount: 1 } }));
    assert.ok(!isValidCustomFields({ $where: "1" }));
    assert.ok(!isValidCustomFields({ "a.b": 1 }));
    assert.ok(!isValidCustomFields([1, 2]));
    assert.ok(!isValidCustomFields({ fee: { $gt: 1 } }));
    assert.ok(!isValidCustomFields({ big: "x".repeat(2001) }));
  });
});

const TEST_URI = process.env.MONGO_TEST_URI;
const isLocal = TEST_URI && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(TEST_URI);
const skip = !TEST_URI
  ? "set MONGO_TEST_URI=mongodb://127.0.0.1:<port> to run"
  : !isLocal
    ? "MONGO_TEST_URI must be a local mongodb:// URI (remote/Atlas refused)"
    : false;

function workbook(sheets) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

describe("custom fields and progress against a local MongoDB", { skip }, () => {
  const mongoose = require("mongoose");
  const app = require("../src/app");
  const University = require("../src/models/University");
  const UniversityCourse = require("../src/models/UniversityCourse");
  const CustomFieldDefinition = require("../src/models/CustomFieldDefinition");
  const ExcelImport = require("../src/models/ExcelImport");

  const dbName = `edupath_custom_test_${Date.now()}`;
  const uri = (() => {
    const url = new URL(TEST_URI);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();

  let server;
  let baseUrl;

  async function upload(step, buffer, { selections, query = {} } = {}) {
    const params = new URLSearchParams({ fileName: "custom.xlsx", mode: "skip", defaultCountry: "", ...query });
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

  /** Automatic mapping, then patched per header; unmapped columns stay unmapped. */
  const selectionsFrom = (preview, sheetName, patch = {}, customFields) => ({
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
            ...patch[column.header],
          })),
      },
    ],
    ...(customFields ? { customFields } : {}),
  });

  // "scholarship" itself is a built-in University field, hence "scholarshipAmount"
  const scholarship = { entity: "university", key: "scholarshipAmount", label: "Scholarship", type: "number" };

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

  test("a new field is created only after confirmation, then reused and merged", async () => {
    const buffer = workbook({
      Universities: [
        ["University", "Country", "Scholarship", "Partner Since"],
        ["Omicron University", "Germany", "5,000", "2019"],
        ["Pi University", "Germany", "some", "2020"],
      ],
    });

    const auto = (await upload("preview", buffer)).body.data;
    assert.equal(auto.sheets[0].columns[2].status, "unexpected");

    const selections = selectionsFrom(auto, "Universities", {
      Scholarship: { field: "custom:scholarshipAmount" },
      "Partner Since": { include: false },
    }, [scholarship]);

    const preview = (await upload("preview", buffer, { selections })).body.data;
    assert.equal(preview.mappingErrors, 0);
    assert.deepEqual(preview.newCustomFields, [scholarship]);
    assert.ok(preview.fields.some((field) => field.key === "custom:scholarshipAmount" && field.custom.isNew));
    assert.ok(preview.issues.some((issue) => issue.code === "custom_value_invalid" && issue.row === 3));
    assert.equal(await CustomFieldDefinition.countDocuments(), 0, "preview creates nothing");

    const unconfirmed = await upload("confirm", buffer, { selections, query: { expectedHash: preview.sha256 } });
    assert.equal(unconfirmed.status, 400);
    assert.match(unconfirmed.body.message, /explicit confirmation/);
    assert.equal(await University.countDocuments({ name: "Omicron University" }), 0);

    const confirmed = await upload("confirm", buffer, {
      selections,
      query: { expectedHash: preview.sha256, confirmCustomFields: "true" },
    });
    assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
    assert.deepEqual(confirmed.body.data.customFields, [scholarship]);

    const omicron = await University.findOne({ name: "Omicron University" }).lean();
    assert.deepEqual(omicron.customFields, { scholarshipAmount: 5000 });
    assert.equal(omicron.scholarshipAmount, undefined, "no top-level schema change");
    const pi = await University.findOne({ name: "Pi University" }).lean();
    assert.equal(pi.customFields, undefined, "invalid number is not stored");
    assert.equal(pi.sourceRow.Scholarship, "some", "but kept in the original row");

    const definition = await CustomFieldDefinition.findOne({ key: "scholarshipAmount" }).lean();
    assert.equal(definition.type, "number");
    assert.equal(definition.createdByImport, confirmed.body.data.importId);
    const log = await ExcelImport.findOne({ importId: confirmed.body.data.importId }).lean();
    assert.equal(log.createdCustomFields[0].key, "scholarshipAmount");

    // Later import: the header is recognised as the saved field; update merges per key
    await University.updateOne({ _id: omicron._id }, { $set: { "customFields.other": "kept" } });
    const next = workbook({ Universities: [["University", "Country", "Scholarship"], ["Omicron University", "Germany", "6000"]] });
    const nextPreview = (await upload("preview", next, { query: { mode: "update" } })).body.data;
    const column = nextPreview.sheets[0].columns[2];
    assert.equal(column.mappedTo, "custom:scholarshipAmount");
    assert.equal(column.confidence, "high");
    assert.equal(nextPreview.newCustomFields.length, 0);

    const updated = await upload("confirm", next, {
      query: { mode: "update", expectedHash: nextPreview.sha256, confirmOverwrite: "true" },
    });
    assert.equal(updated.status, 201, JSON.stringify(updated.body));
    const after = await University.findOne({ _id: omicron._id }).lean();
    assert.deepEqual(after.customFields, { scholarshipAmount: 6000, other: "kept" });
  });

  test("course custom fields go to courses; entity, names and types are enforced", async () => {
    const buffer = workbook({
      Courses: [
        ["University", "Country", "Course", "Degree", "Lab Access", "Modules JSON"],
        ["Rho University", "Germany", "Robotics", "MSc", "yes", '{"core": 4, "elective": 2}'],
      ],
    });
    const auto = (await upload("preview", buffer)).body.data;
    assert.equal(auto.sheets[0].type, "courses");

    const labAccess = { entity: "course", key: "labAccess", label: "Lab Access", type: "boolean" };
    const modules = { entity: "course", key: "modules", label: "Modules", type: "object" };
    const selections = selectionsFrom(auto, "Courses", {
      "Lab Access": { field: "custom:labAccess" },
      "Modules JSON": { field: "custom:modules" },
    }, [labAccess, modules]);

    const preview = (await upload("preview", buffer, { selections })).body.data;
    assert.equal(preview.mappingErrors, 0, JSON.stringify(preview.issues.filter((issue) => issue.severity === "ERROR")));
    const result = await upload("confirm", buffer, {
      selections,
      query: { expectedHash: preview.sha256, confirmCustomFields: "true" },
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));

    const course = await UniversityCourse.findOne({ courseName: "Robotics" }).lean();
    assert.deepEqual(course.customFields, { labAccess: true, modules: { core: 4, elective: 2 } });
    const rho = await University.findOne({ name: "Rho University" }).lean();
    assert.equal(rho.customFields, undefined, "course fields are not written to the university");

    // A course field cannot be used on a university sheet
    const universities = workbook({ Universities: [["University", "Country", "Lab Access"], ["Sigma University", "Germany", "no"]] });
    const uniAuto = (await upload("preview", universities)).body.data;
    const wrongEntity = (await upload("preview", universities, {
      selections: selectionsFrom(uniAuto, "Universities", { "Lab Access": { field: "custom:labAccess" } }),
    })).body.data;
    assert.ok(wrongEntity.issues.some((issue) => issue.code === "field_not_used"));
    assert.equal(wrongEntity.canImport, false);

    // Built-in names, type conflicts and unknown fields are refused
    const builtIn = await upload("preview", universities, {
      selections: selectionsFrom(uniAuto, "Universities", { "Lab Access": { field: "custom:country" } }, [
        { entity: "university", key: "country", label: "Country", type: "string" },
      ]),
    });
    assert.equal(builtIn.status, 400);
    assert.match(builtIn.body.message, /built-in/);

    const conflict = await upload("preview", buffer, {
      selections: selectionsFrom(auto, "Courses", { "Lab Access": { field: "custom:labAccess" } }, [
        { ...labAccess, type: "string" },
      ]),
    });
    assert.equal(conflict.status, 400);
    assert.match(conflict.body.message, /already exists/);

    const unknown = await upload("preview", universities, {
      selections: selectionsFrom(uniAuto, "Universities", { "Lab Access": { field: "custom:neverCreated" } }),
    });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.message, /does not exist/);

    // A new field that no column feeds is a blocking mapping error
    const unused = (await upload("preview", universities, {
      selections: selectionsFrom(uniAuto, "Universities", { "Lab Access": { include: false } }, [
        { entity: "university", key: "ranking2", label: "Ranking 2", type: "string" },
      ]),
    })).body.data;
    assert.ok(unused.issues.some((issue) => issue.code === "custom_field_unmapped"));
    assert.equal(unused.canImport, false);
  });

  test("field creation can be disabled on the server", async () => {
    const buffer = workbook({ Universities: [["University", "Country", "Motto"], ["Tau University", "Germany", "Lux"]] });
    const auto = (await upload("preview", buffer)).body.data;
    const selections = selectionsFrom(auto, "Universities", { Motto: { field: "custom:motto" } }, [
      { entity: "university", key: "motto", label: "Motto", type: "string" },
    ]);

    process.env.EXCEL_IMPORT_CUSTOM_FIELDS = "off";
    try {
      const refused = await upload("preview", buffer, { selections });
      assert.equal(refused.status, 403);
      assert.equal(auto.customFieldCreation, true);
    } finally {
      delete process.env.EXCEL_IMPORT_CUSTOM_FIELDS;
    }
  });

  test("the CRUD endpoints cannot write customFields", async () => {
    await University.create({ id: "UNI-UPSILON", name: "Upsilon University", country: "Germany" });

    const patch = await fetch(`${baseUrl}/universities/UNI-UPSILON`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: "Ulm",
        customFields: { injected: 1 },
        "customFields.dotted": 1,
        $set: { "customFields.operator": 1 },
      }),
    });
    assert.equal(patch.status, 200);

    const upsilon = await University.findOne({ id: "UNI-UPSILON" }).lean();
    assert.equal(upsilon.city, "Ulm");
    assert.equal(upsilon.customFields, undefined);

    const created = await fetch(`${baseUrl}/universities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "UNI-PHI", name: "Phi University", country: "Germany", customFields: { injected: 1 } }),
    });
    assert.equal(created.status, 201);
    assert.equal((await University.findOne({ id: "UNI-PHI" }).lean()).customFields, undefined);
  });

  test("progress is reported per request and finishes only when the response is ready", async () => {
    const rows = [["University", "Country", "City"]];
    for (let index = 0; index < 1200; index++) rows.push([`Chi University ${index}`, "Germany", "Jena"]);
    const buffer = workbook({ Universities: rows });

    const progressId = `test-${Date.now()}`;
    const seen = [];
    let finished = false;

    const poll = (async () => {
      while (!finished) {
        const response = await fetch(`${baseUrl}/universities/import/progress/${progressId}`);
        const state = (await response.json()).data;
        if (state) seen.push(state);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();

    const preview = await upload("preview", buffer, { query: { progressId } });
    finished = true;
    await poll;

    assert.equal(preview.status, 200);
    const final = await (await fetch(`${baseUrl}/universities/import/progress/${progressId}`)).json();
    assert.equal(final.data.phase, "done");
    assert.equal(final.data.done, true);
    assert.equal(final.data.totalRows, 1200, "validation counts the data rows");
    assert.equal(final.data.processedRows, 1200);
    assert.equal(final.data.rowsDetected, 1201, "non-blank rows incl. the header row");

    for (const state of seen.filter((item) => !item.done)) {
      assert.ok((state.processedRows ?? 0) <= (state.totalRows ?? Infinity), "never more than the total");
    }

    const unknown = await fetch(`${baseUrl}/universities/import/progress/unknown-id-123`);
    assert.equal(unknown.status, 200);
    assert.equal((await unknown.json()).data, null, "not started (or expired)");
    assert.equal((await fetch(`${baseUrl}/universities/import/progress/bad`)).status, 400);

    // Phases arrive in order and the counted phases never pass their total
    const order = ["receiving", "reading", "scanning", "validating", "checking", "done"];
    const phases = seen.map((state) => order.indexOf(state.phase)).filter((index) => index >= 0);
    assert.deepEqual(phases, [...phases].sort((a, b) => a - b), "phases do not go backwards");
  });
});
