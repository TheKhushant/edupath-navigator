// Tests for POST /api/<resource>/bulk-delete
//
//   npm test
//
// Runs only when MONGO_TEST_URI points to a LOCAL MongoDB (localhost /
// 127.0.0.1); uses a fresh, uniquely named database and drops only that.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

const TEST_URI = process.env.MONGO_TEST_URI;
const isLocal = TEST_URI && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(TEST_URI);
const skip = !TEST_URI
  ? "set MONGO_TEST_URI=mongodb://127.0.0.1:<port> to run"
  : !isLocal
    ? "MONGO_TEST_URI must be a local mongodb:// URI (remote/Atlas refused)"
    : false;

describe("bulk delete against a local MongoDB", { skip }, () => {
  const mongoose = require("mongoose");
  const app = require("../src/app");
  const University = require("../src/models/University");
  const UniversityCourse = require("../src/models/UniversityCourse");
  const Course = require("../src/models/Course");
  const Student = require("../src/models/Student");

  const dbName = `edupath_bulk_test_${Date.now()}`;
  const uri = (() => {
    const url = new URL(TEST_URI);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();

  let server;
  let baseUrl;

  const bulkDelete = async (resource, body) => {
    const response = await fetch(`${baseUrl}/${resource}/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

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

  test("universities: deletes only the listed ones, by readable id or _id; no cascade", async () => {
    const [alpha, beta] = await University.create([
      { id: "UNI-A", name: "Alpha University", country: "Germany" },
      { id: "UNI-B", name: "Beta University", country: "Germany" },
      { id: "UNI-C", name: "Gamma University", country: "Germany" },
    ]);
    await UniversityCourse.create({ id: "UC-A1", courseName: "Physics", universityId: alpha._id });

    const { status, body } = await bulkDelete("universities", { ids: ["UNI-A", String(beta._id), "UNI-MISSING", "UNI-A"] });

    assert.equal(status, 200);
    assert.equal(body.data.deleted, 2);
    assert.deepEqual(body.data.deletedIds.sort(), ["UNI-A", "UNI-B"]);
    assert.deepEqual(body.data.notFound, ["UNI-MISSING"]);
    assert.deepEqual((await University.find().lean()).map((university) => university.id), ["UNI-C"]);
    assert.equal(await UniversityCourse.countDocuments({ id: "UC-A1" }), 1, "linked courses are kept, like single delete");
  });

  test("students, catalogue courses and programmes", async () => {
    await Student.create([
      { id: "SS-2026-9001", name: "Asha", email: "asha@example.com" },
      { id: "SS-2026-9002", name: "Ravi", email: "ravi@example.com" },
    ]);
    await Course.create([{ id: "CRS-1", name: "Data Science" }, { id: "CRS-2", name: "MBA" }]);
    await UniversityCourse.create({ id: "UC-B1", courseName: "Chemistry" });

    assert.equal((await bulkDelete("students", { ids: ["SS-2026-9001", "SS-2026-9002"] })).body.data.deleted, 2);
    assert.equal(await Student.countDocuments(), 0);

    assert.equal((await bulkDelete("courses", { ids: ["CRS-2"] })).body.data.deleted, 1);
    assert.deepEqual((await Course.find().lean()).map((course) => course.id), ["CRS-1"]);

    assert.equal((await bulkDelete("university-courses", { ids: ["UC-B1"] })).body.data.deleted, 1);
    assert.equal(await UniversityCourse.countDocuments({ id: "UC-B1" }), 0);
  });

  test("invalid requests delete nothing", async () => {
    await University.create({ id: "UNI-SAFE", name: "Safe University", country: "Germany" });

    for (const body of [{}, { ids: [] }, { ids: "UNI-SAFE" }, { ids: [{ $ne: null }] }, { ids: [""] }, { ids: Array(501).fill("x") }]) {
      const result = await bulkDelete("universities", body);
      assert.equal(result.status, 400, JSON.stringify(body).slice(0, 40));
    }

    assert.equal(await University.countDocuments({ id: "UNI-SAFE" }), 1);
  });
});
