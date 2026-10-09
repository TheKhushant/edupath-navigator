// Tests for scripts/importHochschulkompass.js
//
//   npm test
//
// Unit tests need no database. The integration tests run only when
// MONGO_TEST_URI points to a LOCAL MongoDB (localhost / 127.0.0.1); they
// use a fresh, uniquely named database and drop only that database.
// Atlas / remote URIs are refused, so production data is never touched.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  readInput,
  toRecord,
  validate,
  identity,
  readableId,
  createUniversityResolver,
} = require("../scripts/importHochschulkompass");
const { normalizeName } = require("../src/utils/universityNameMatching");

const SCRIPT = path.join(__dirname, "..", "scripts", "importHochschulkompass.js");
const ALIAS_FILE = path.join(__dirname, "..", "data", "hochschulkompass-university-aliases.json");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hsk-test-"));
const writeTmp = (name, content) => {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, content);
  return file;
};

const valid = (overrides = {}) => ({
  programmeName: "Accompaniment",
  universityName: "Staatliche Hochschule für Musik und Darstellende Kunst Stuttgart",
  degree: "Master of Music",
  studyMode: "full-time",
  ...overrides,
});


// ======================================================
// INPUT MAPPING
// ======================================================

describe("toRecord", () => {
  test("maps English and German column names onto canonical fields", () => {
    const record = toRecord({
      Studiengang: "Übersetzen",
      Hochschule: "Universität zu Köln",
      Abschluss: "Master of Arts",
      Studienform: "Vollzeit",
      "Modes of study": "ignored, Studienform came first",
      "Learn More": "https://example.org/x",
      Unknown: "dropped",
    });

    assert.equal(record.programmeName, "Übersetzen");
    assert.equal(record.universityName, "Universität zu Köln");
    assert.equal(record.degree, "Master of Arts");
    assert.equal(record.studyMode, "Vollzeit");
    assert.equal(record.sourceUrl, "https://example.org/x");
    assert.equal(record.Unknown, undefined);
  });

  test("trims, collapses whitespace, joins arrays and drops empty values", () => {
    const record = toRecord({
      programmeName: "  Data   Science \n",
      languages: ["German", " English ", ""],
      degree: "   ",
    });

    assert.equal(record.programmeName, "Data Science");
    assert.equal(record.languages, "German, English");
    assert.equal(record.degree, undefined);
  });
});

describe("readInput", () => {
  const rows = [{ programmeName: "Übersetzen", universityName: "Universität zu Köln" }];

  test("reads UTF-8 CSV without BOM, with BOM and Windows-1252 CSV", () => {
    const files = [
      writeTmp("utf8.csv", "programmeName,universityName\nÜbersetzen,Universität zu Köln\n"),
      writeTmp("bom.csv", "﻿programmeName;universityName\nÜbersetzen;Universität zu Köln\n"),
      writeTmp("latin.csv", Buffer.from("programmeName;universityName\n\xdcbersetzen;Universit\xe4t zu K\xf6ln\n", "latin1")),
    ];

    files.forEach((file) => assert.deepEqual(readInput(file), rows, file));
  });

  test("keeps CSV values as text (leading zeros in ids)", () => {
    const file = writeTmp("ids.csv", "sourceRecordId,programmeName\n007,X\n");
    assert.equal(readInput(file)[0].sourceRecordId, "007");
  });

  test("reads JSON arrays and {records|programmes|data} wrappers", () => {
    assert.deepEqual(readInput(writeTmp("a.json", JSON.stringify(rows))), rows);
    assert.deepEqual(readInput(writeTmp("b.json", JSON.stringify({ records: rows }))), rows);
    assert.deepEqual(readInput(writeTmp("c.json", JSON.stringify({ programmes: rows }))), rows);
    assert.throws(() => readInput(writeTmp("d.json", JSON.stringify({ nope: 1 }))));
  });
});


// ======================================================
// VALIDATION (the exact search filters)
// ======================================================

describe("validate", () => {
  test("accepts a complete full-time Master record", () => {
    assert.deepEqual(validate(valid()).errors, []);
  });

  test("accepts each of the four admission modes (English and German)", () => {
    [
      "without admission restriction",
      "local admission restriction",
      "nationwide admission restriction",
      "selection procedure / qualifying examination",
      "zulassungsfrei",
      "örtlich zulassungsbeschränkt",
      "bundesweit zulassungsbeschränkt",
      "Auswahlverfahren / Eignungsprüfung",
    ].forEach((admissionMode) => {
      assert.deepEqual(validate(valid({ admissionMode })).errors, [], admissionMode);
    });
  });

  test("rejects other admission modes", () => {
    assert.match(validate(valid({ admissionMode: "something else" })).errors[0], /admission mode/);
  });

  test("rejects part-time only, accepts programmes that are also full-time", () => {
    assert.match(validate(valid({ studyMode: "part-time" })).errors[0], /not full-time/);
    assert.match(validate(valid({ studyMode: "Teilzeit" })).errors[0], /not full-time/);
    assert.deepEqual(validate(valid({ studyMode: "full-time, part-time" })).errors, []);
    assert.deepEqual(validate(valid({ studyMode: "Vollzeit" })).errors, []);
  });

  test("rejects non-Master degrees, accepts Master/Magister variants", () => {
    ["Bachelor of Arts", "Diplom", "Staatsexamen", "Promotion", "PhD"].forEach((degree) => {
      assert.match(validate(valid({ degree })).errors[0], /not a Master/, degree);
    });

    ["Master of Music", "Magister", "Magister Artium", "M.Sc.", "LL.M.", "MBA"].forEach((degree) => {
      assert.deepEqual(validate(valid({ degree })).errors, [], degree);
    });
  });

  test("rejects missing programme or university names", () => {
    assert.match(validate(valid({ programmeName: undefined })).errors[0], /programme name/);
    assert.match(validate(valid({ universityName: undefined })).errors[0], /university name/);
  });

  test("warns about missing study mode / degree without rejecting", () => {
    const { errors, warnings } = validate(valid({ studyMode: undefined, degree: undefined }));

    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 2);
  });

  test("does not store invalid URLs", () => {
    const record = valid({ sourceUrl: "not-a-url", programmeUrl: "https://uni.example/prog" });
    const { warnings } = validate(record);

    assert.equal(record.sourceUrl, undefined);
    assert.equal(record.programmeUrl, "https://uni.example/prog");
    assert.match(warnings[0], /sourceUrl/);
  });

  test("parses ECTS numbers and ignores non-numeric values", () => {
    const cases = [["120 ECTS", 120], ["90,5", 90.5], ["60", 60]];

    cases.forEach(([ects, expected]) => {
      const record = valid({ ects });
      validate(record);
      assert.equal(record.ectsNumber, expected, ects);
    });

    const record = valid({ ects: "not stated" });
    assert.match(validate(record).warnings[0], /ECTS/);
    assert.equal(record.ectsNumber, undefined);
  });
});


// ======================================================
// IDENTITY / DEDUPE KEYS
// ======================================================

describe("identity", () => {
  test("prefers the source programme id", () => {
    assert.equal(identity(valid({ sourceRecordId: "123" })), "id:123");
  });

  test("composite key ignores case, accents and spacing", () => {
    const a = identity(valid({ city: "Stuttgart" }));
    const b = identity(valid({
      programmeName: "  ACCOMPANIMENT ",
      universityName: "Staatliche Hochschule fur Musik und  Darstellende Kunst Stuttgart",
      city: "stuttgart",
    }));

    assert.equal(a, b);
  });

  test("same programme name at different universities or locations stays distinct", () => {
    const base = identity(valid({ city: "Stuttgart" }));

    assert.notEqual(base, identity(valid({ city: "Mannheim" })));
    assert.notEqual(base, identity(valid({ universityName: "Universität der Künste Berlin" })));
    assert.notEqual(base, identity(valid({ degree: "Master of Arts" })));
  });

  test("readable ids are deterministic and sanitized", () => {
    assert.equal(readableId("HSK-", "12/34 x", "k"), "HSK-1234x");
    assert.equal(readableId("HSK-", undefined, "k:a"), readableId("HSK-", "", "k:a"));
    assert.notEqual(readableId("HSK-", undefined, "k:a"), readableId("HSK-", undefined, "k:b"));
  });
});


// ======================================================
// UNIVERSITY MATCHING
// ======================================================

describe("university resolver", () => {
  const universities = [
    { _id: "a1", id: "DEU-005", name: "Humboldt University of Berlin" },
    { _id: "a2", id: "DEU-012", name: "University of Hamburg" },
    { _id: "a3", id: "HSK-U-1", name: "Hochschule Neu", source: "hochschulkompass", sourceRecordId: "U-77" },
    { _id: "a4", id: "X-1", name: "Hochschule Doppelt (Campus A)" },
    { _id: "a5", id: "X-2", name: "Hochschule Doppelt (Campus B)" },
  ];
  const resolve = createUniversityResolver(universities);

  test("links official German names through the alias file", () => {
    const result = resolve({ universityName: "Humboldt-Universität zu Berlin" });
    assert.equal(result.university.id, "DEU-005");
    assert.equal(result.via, "alias");
  });

  test("links identical names through the existing name matcher", () => {
    const result = resolve({ universityName: "University of Hamburg" });
    assert.equal(result.university.id, "DEU-012");
    assert.equal(result.via, "name");
  });

  test("links previously imported universities by source id", () => {
    const result = resolve({ universityName: "Renamed", universityId: "U-77" });
    assert.equal(result.university.id, "HSK-U-1");
  });

  test("reports unknown and ambiguous names instead of guessing", () => {
    assert.match(resolve({ universityName: "Hochschule Nirgendwo" }).reason, /No matching/);
    assert.match(resolve({ universityName: "Hochschule Doppelt" }).reason, /Ambiguous/);
  });

  test("reports aliases that point to a university that does not exist", () => {
    const result = createUniversityResolver([])({ universityName: "Humboldt-Universität zu Berlin" });
    assert.match(result.reason, /does not exist/);
  });
});

describe("alias file", () => {
  const { aliases } = JSON.parse(fs.readFileSync(ALIAS_FILE, "utf8"));

  test("only points to existing-style university ids", () => {
    Object.entries(aliases).forEach(([name, id]) => assert.match(id, /^DEU-\d{3}$/, name));
  });

  test("has no names that normalize to the same key with different targets", () => {
    const seen = new Map();

    Object.entries(aliases).forEach(([name, id]) => {
      const key = normalizeName(name);
      if (seen.has(key)) assert.equal(seen.get(key), id, name);
      seen.set(key, id);
    });
  });
});


// ======================================================
// INTEGRATION (local MongoDB only)
// ======================================================

const TEST_URI = process.env.MONGO_TEST_URI;
const isLocal = TEST_URI && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(TEST_URI);
const skip = !TEST_URI
  ? "set MONGO_TEST_URI=mongodb://127.0.0.1:<port> to run"
  : !isLocal
    ? "MONGO_TEST_URI must be a local mongodb:// URI (remote/Atlas refused)"
    : false;

describe("import against a local MongoDB", { skip }, () => {
  const mongoose = require("mongoose");
  const University = require("../src/models/University");
  const UniversityCourse = require("../src/models/UniversityCourse");

  const dbName = `edupath_hsk_test_${Date.now()}`;
  const uri = (() => {
    const url = new URL(TEST_URI);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();
  const reportFile = path.join(tmpDir, "report.json");
  const normalizedFile = path.join(tmpDir, "normalized.json");

  const run = (file, ...flags) => {
    execFileSync(process.execPath, [
      SCRIPT, `--file=${file}`, `--report=${reportFile}`, `--normalized=${normalizedFile}`, ...flags,
    ], { env: { ...process.env, MONGO_URI: uri }, stdio: "pipe" });

    return JSON.parse(fs.readFileSync(reportFile, "utf8"));
  };

  const fingerprint = async () => {
    const docs = [
      ...(await University.find({}).lean()),
      ...(await UniversityCourse.find({}).lean()),
    ];
    return new Map(docs.map((doc) => [String(doc._id), JSON.stringify(doc)]));
  };

  let existing;

  const fixture = writeTmp("fixture.json", JSON.stringify([
    valid({ city: "Stuttgart", admissionMode: "selection procedure / qualifying examination" }),
    valid({ sourceRecordId: "P-2", programmeName: "Physics", universityName: "Humboldt-Universität zu Berlin", ects: "120 ECTS", languages: ["German", "English"] }),
    valid({ sourceRecordId: "P-2", programmeName: "Physics", universityName: "Humboldt-Universität zu Berlin" }),
    valid({ programmeName: "Existing Programme", universityName: "Universität Hamburg", degree: "Master of Arts" }),
    valid({ programmeName: "Part-time", studyMode: "part-time" }),
    valid({ programmeName: "Bachelor", degree: "Bachelor of Arts" }),
  ]));

  before(async () => {
    // autoIndex off: only the importer itself may create the new index
    await mongoose.connect(uri, { autoIndex: false });

    const humboldt = await University.create({ id: "DEU-005", name: "Humboldt University of Berlin", country: "Germany", city: "Berlin" });
    const hamburg = await University.create({ id: "DEU-012", name: "University of Hamburg", country: "Germany", city: "Hamburg" });
    await UniversityCourse.create({ id: "UC-EXIST-1", courseName: "Existing Programme", degree: "Master of Arts", universityId: hamburg._id });
    await UniversityCourse.create({ id: "UC-EXIST-2", courseName: "Other", universityId: humboldt._id });

    existing = await fingerprint();
  });

  after(async () => {
    // Drops ONLY the uniquely named local test database created above.
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });

  test("dry run writes nothing (no documents, no index)", async () => {
    const report = run(fixture, "--dry-run", "--create-universities");

    assert.equal(report.summary.wouldInsert, 2);
    assert.equal(report.summary.wouldInsertUniversities, 1);
    assert.equal(report.summary.alreadyExisting, 1);
    assert.equal(report.summary.duplicatesInFile, 1);
    assert.equal(report.summary.invalid, 2);

    assert.deepEqual(await fingerprint(), existing);
    const indexes = await UniversityCourse.collection.indexes();
    assert.ok(!indexes.some((index) => index.key.sourceKey), "dry run must not create indexes");

    const normalized = JSON.parse(fs.readFileSync(normalizedFile, "utf8"));
    assert.equal(normalized.programmes.length, 2);
    assert.equal(normalized.universities.length, 1);
  });

  test("import inserts only new records and leaves existing documents unchanged", async () => {
    const report = run(fixture, "--create-universities");

    assert.equal(report.summary.inserted, 2);
    assert.equal(report.summary.newUniversitiesInserted, 1);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.verification.existingRecordsModifiedOrRemoved, 0);

    const after = await fingerprint();
    existing.forEach((doc, id) => assert.equal(after.get(id), doc, `existing ${id} changed`));

    const physics = await UniversityCourse.findOne({ id: "HSK-P-2" }).populate("universityId").lean();
    assert.equal(physics.universityId.id, "DEU-005");
    assert.equal(physics.universityExternalId, "DEU-005");
    assert.equal(physics.ects, 120);
    assert.equal(physics.language, "German, English");
    assert.equal(physics.source, "hochschulkompass");

    const created = await University.findOne({ source: "hochschulkompass" }).lean();
    assert.equal(created.name, "Staatliche Hochschule für Musik und Darstellende Kunst Stuttgart");
    const accompaniment = await UniversityCourse.findOne({ courseName: "Accompaniment" }).lean();
    assert.equal(String(accompaniment.universityId), String(created._id));
  });

  test("re-running is idempotent (nothing inserted, universities reused)", async () => {
    const before = await fingerprint();
    const report = run(fixture, "--create-universities");

    assert.equal(report.summary.inserted, 0);
    assert.equal(report.summary.newUniversitiesInserted, 0);
    assert.equal(report.summary.alreadyExisting, 3);
    assert.deepEqual(await fingerprint(), before);
  });

  test("a later file reuses universities created by an earlier import", async () => {
    const file = writeTmp("later.json", JSON.stringify([
      valid({ programmeName: "Conducting", degree: "Master of Music" }),
    ]));
    const report = run(file, "--create-universities");

    assert.equal(report.summary.inserted, 1);
    assert.equal(report.summary.newUniversitiesInserted, 0);
    assert.equal(await University.countDocuments({ source: "hochschulkompass" }), 1);
  });

  test("unique index blocks duplicate imported programmes at database level", async () => {
    const doc = await UniversityCourse.findOne({ id: "HSK-P-2" }).lean();

    await assert.rejects(
      UniversityCourse.create({ courseName: "Copy", source: doc.source, sourceKey: doc.sourceKey }),
      (error) => error.code === 11000,
    );

    // Records without a source (all pre-existing data) are not constrained
    await UniversityCourse.collection.insertOne({ courseName: "Manual A" });
    await UniversityCourse.collection.insertOne({ courseName: "Manual B" });
  });

  test("GET /api/university-courses filters, and is unchanged without filters", async () => {
    const app = require("../src/app");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/university-courses`;
    const get = async (query = "") => (await fetch(base + query)).json();

    try {
      const all = await get();
      assert.equal(all.count, await UniversityCourse.countDocuments());

      assert.equal((await get("?source=hochschulkompass")).count, 3);
      assert.equal((await get("?q=physics")).count, 1);
      assert.equal((await get("?q=(.*")).count, 0); // regex characters are escaped
      assert.equal((await get("?source=hochschulkompass&city[$ne]=x")).count, 3); // operators ignored

      const one = (await get("?universityExternalId=DEU-005&source=hochschulkompass")).data;
      assert.equal(one.length, 1);
      assert.equal(one[0].universityId.name, "Humboldt University of Berlin");
    } finally {
      server.close();
    }
  });
});
