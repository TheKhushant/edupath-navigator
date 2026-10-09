// Tests for the University & Course Explorer API (/api/explorer)
//
//   npm test
//
// Runs only when MONGO_TEST_URI points to a LOCAL MongoDB (localhost /
// 127.0.0.1); uses a fresh, uniquely named database and drops only that.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFileSync } = require("child_process");

const SEED_SCRIPT = path.join(__dirname, "..", "scripts", "seedSearchTags.js");

const TEST_URI = process.env.MONGO_TEST_URI;
const isLocal = TEST_URI && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(TEST_URI);
const skip = !TEST_URI
  ? "set MONGO_TEST_URI=mongodb://127.0.0.1:<port> to run"
  : !isLocal
    ? "MONGO_TEST_URI must be a local mongodb:// URI (remote/Atlas refused)"
    : false;

describe("explorer API against a local MongoDB", { skip }, () => {
  const mongoose = require("mongoose");
  const app = require("../src/app");
  const University = require("../src/models/University");
  const UniversityCourse = require("../src/models/UniversityCourse");
  const Country = require("../src/models/Country");
  const { invalidateDictionary } = require("../src/services/searchTagDictionary");

  const dbName = `edupath_explorer_test_${Date.now()}`;
  const uri = (() => {
    const url = new URL(TEST_URI);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();

  let server;
  let baseUrl;

  const get = async (pathname) => {
    const response = await fetch(`${baseUrl}${pathname}`);
    return { status: response.status, body: await response.json() };
  };
  const post = async (pathname, body) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  const ids = (body) => body.data.map((item) => item.id);

  before(async () => {
    await mongoose.connect(uri);

    // Search tags first, so the documents below are tagged when created
    execFileSync(process.execPath, [SEED_SCRIPT], { env: { ...process.env, MONGO_URI: uri }, stdio: "pipe" });
    invalidateDictionary();

    await Country.create({
      id: "CTY-DE",
      name: "Germany",
      requiredDocuments: [{ document: "APS Certificate" }],
      intakes: [{ intake: "Winter", applicationDeadline: "15 July" }],
    });

    const [tum, rwth, tud, dublin] = await University.create([
      {
        id: "DEU-001", name: "Technical University of Munich (TUM)", country: "Germany", city: "Munich",
        ranking: "22", tuitionFeeMin: 0, tuitionFeeMax: 6000, applicationDeadline: "January-May",
        englishRequirement: "6.5", requirements: ["APS Certificate", "GRE required for some programs"],
        popularCourses: ["Computer Science", "AI", "Data Science"], website: "https://www.tum.de",
      },
      {
        id: "DEU-002", name: "RWTH Aachen University", country: "Germany", city: "Aachen",
        ranking: "105", tuitionFeeMin: 0, tuitionFeeMax: 1500, applicationDeadline: "June",
        englishRequirement: "IELTS 6.0 overall", popularCourses: ["Mechanical Engineering"],
      },
      {
        id: "DEU-003", name: "TU Dresden", country: "Germany", city: "Dresden",
        ranking: "#201-250", applicationDeadline: "Multiple Dates", englishRequirement: "Varies",
        popularCourses: ["Biotechnology"], universityType: "Universität",
      },
      {
        id: "IRL-001", name: "University College Dublin", country: "Ireland", city: "Dublin",
        ranking: "130", tuitionFeeMin: 18000, tuitionFeeMax: 26000, applicationDeadline: "30 Jun",
        englishRequirement: "6.5", popularCourses: ["Data Science", "Finance"],
      },
    ]);

    await UniversityCourse.create([
      {
        id: "UC-TUM-AI", courseName: "MSc Artificial Intelligence", degree: "MSc", universityId: tum._id,
        universityExternalId: "DEU-001", universityName: tum.name, language: "German, English",
        duration: "2 years", intake: "October 2027", applicationDeadline: "31 May 2027", ielts: "6.5",
        tuitionMin: 0, tuitionMax: 6000, studyMode: "full-time", eligibility: "Bachelor in CS, GRE optional",
      },
      {
        id: "UC-RWTH-ME", courseName: "MSc Mechanical Engineering", degree: "MSc", universityId: rwth._id,
        universityExternalId: "DEU-002", universityName: rwth.name, language: "English",
        duration: "2 years", intake: "Winter semester", applicationDeadline: "15.07.", ielts: "Not required",
        studyMode: "full-time", applicationMethod: "uni-assist",
      },
      {
        id: "UC-UCD-DS", courseName: "MSc Data Science", degree: "MSc", universityId: dublin._id,
        universityExternalId: "IRL-001", universityName: dublin.name, language: "English",
        duration: "1 year", intake: "September 2027", applicationDeadline: "30 Jun 2027", ielts: "6.5",
        tuitionMin: 18000, tuitionMax: 21000, city: "Dublin",
      },
      {
        id: "UC-TUD-BIO", courseName: "Biotechnologie", degree: "Master of Science", universityId: tud._id,
        universityExternalId: "DEU-003", universityName: tud.name, language: "German",
        subjectArea: "Biology", city: "Dresden",
      },
    ]);

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

  // ---------- facets ----------

  test("facets list only values that exist, split and cleaned", async () => {
    const { status, body } = await get("/explorer/facets");
    assert.equal(status, 200);

    const facets = body.data;
    assert.deepEqual(facets.countries, ["Germany", "Ireland"]);
    assert.deepEqual(facets.languages, ["English", "German"]);
    assert.ok(facets.intakes.includes("October") && facets.intakes.includes("Winter semester"));
    assert.ok(!facets.intakes.some((value) => /20\d\d/.test(value)), "years are removed from intakes");
    assert.ok(facets.subjects.includes("AI") && facets.subjects.includes("Biology"));
    assert.deepEqual(facets.applicationMethods, ["uni-assist"]);
    assert.deepEqual(facets.universityTypes, ["Universität"]);
    assert.deepEqual(facets.states, [], "no data -> empty list -> filter hidden in the UI");
    for (const values of Object.values(facets)) {
      assert.ok(values.every((value) => typeof value === "string" && value.trim()));
    }
  });

  // ---------- universities ----------

  test("universities: default A-Z, paginated, no internal fields", async () => {
    const { body } = await get("/explorer/universities?limit=2");
    assert.equal(body.total, 4);
    assert.equal(body.count, 2);
    // Case-insensitive A-Z: rwth, technical, tu dresden, university college
    assert.deepEqual(ids(body), ["DEU-002", "DEU-001"]);
    assert.ok(!("sourceRow" in body.data[0]) && !("searchName" in body.data[0]) && !("_sortName" in body.data[0]));
    assert.equal(body.data[0].programmeCount, 1);

    const page2 = await get("/explorer/universities?limit=2&page=2");
    assert.deepEqual(ids(page2.body), ["DEU-003", "IRL-001"]);
  });

  test("universities: AI search uses tags from popular courses", async () => {
    const { body } = await get("/explorer/universities?q=AI");
    assert.equal(body.data[0].id, "DEU-001");
    assert.equal(body.data[0].searchMatch.type, "tag");
    // Data Science is a broader relation of AI
    assert.ok(ids(body).includes("IRL-001"));
    assert.ok(!ids(body).includes("DEU-002"));
    assert.ok(body.search.relatedTermCount > 0);
  });

  test("universities: location, tuition, deadline, IELTS and requirement filters", async () => {
    assert.deepEqual(ids((await get("/explorer/universities?country=Ireland")).body), ["IRL-001"]);
    assert.deepEqual(ids((await get("/explorer/universities?city=Aachen")).body), ["DEU-002"]);
    assert.deepEqual(ids((await get("/explorer/universities?universityType=Universit%C3%A4t")).body), ["DEU-003"]);
    assert.deepEqual(ids((await get("/explorer/universities?maxTuition=1500")).body), ["DEU-002"]);
    assert.deepEqual(ids((await get("/explorer/universities?deadlineMonth=5")).body), ["DEU-001"]);
    assert.deepEqual(ids((await get("/explorer/universities?deadlineMonth=6")).body).sort(), ["DEU-002", "IRL-001"]);

    // "IELTS 6.0 overall" parses as 6.0; "Varies" has no number and is excluded
    assert.deepEqual(ids((await get("/explorer/universities?maxIelts=6")).body), ["DEU-002"]);
    assert.deepEqual(ids((await get("/explorer/universities?requirement=GRE")).body), ["DEU-001"]);
  });

  test("universities: programme-level filters find universities offering such programmes", async () => {
    assert.deepEqual(ids((await get("/explorer/universities?language=German")).body).sort(), ["DEU-001", "DEU-003"]);
    assert.deepEqual(ids((await get("/explorer/universities?degree=Master%20of%20Science")).body), ["DEU-003"]);
    // Subject: popular course OR programme subject
    assert.deepEqual(ids((await get("/explorer/universities?subject=Data%20Science")).body).sort(), ["DEU-001", "IRL-001"]);
    assert.deepEqual(ids((await get("/explorer/universities?subject=Biology")).body), ["DEU-003"]);
    assert.deepEqual(ids((await get("/explorer/universities?applicationMethod=uni-assist")).body), ["DEU-002"]);
  });

  test("universities: sort by ranking and tuition puts missing values last", async () => {
    assert.deepEqual(ids((await get("/explorer/universities?sort=ranking")).body), ["DEU-001", "DEU-002", "IRL-001", "DEU-003"]);
    assert.deepEqual(ids((await get("/explorer/universities?sort=tuition")).body).at(-1), "DEU-003");
  });

  test("universities: search combines with filters", async () => {
    const { body } = await get("/explorer/universities?q=AI&country=Ireland");
    assert.deepEqual(ids(body), ["IRL-001"]);
  });

  // ---------- courses ----------

  test("courses: AI search, populated university, filters through the university", async () => {
    const { body } = await get("/explorer/courses?q=AI");
    assert.equal(body.data[0].id, "UC-TUM-AI");
    assert.equal(body.data[0].universityId.name, "Technical University of Munich (TUM)");
    assert.ok(!("sourceRow" in body.data[0]));

    assert.deepEqual(ids((await get("/explorer/courses?country=Ireland")).body), ["UC-UCD-DS"]);
    // City: the programme's own city or its university's
    assert.deepEqual(ids((await get("/explorer/courses?city=Munich")).body), ["UC-TUM-AI"]);
    assert.deepEqual(ids((await get("/explorer/courses?city=Dublin")).body), ["UC-UCD-DS"]);
    assert.deepEqual(ids((await get("/explorer/courses?universityType=Universit%C3%A4t")).body), ["UC-TUD-BIO"]);
  });

  test("courses: programme filters", async () => {
    assert.deepEqual(ids((await get("/explorer/courses?language=German")).body).sort(), ["UC-TUD-BIO", "UC-TUM-AI"]);
    assert.deepEqual(ids((await get("/explorer/courses?intake=September")).body), ["UC-UCD-DS"]);
    assert.deepEqual(ids((await get("/explorer/courses?duration=1%20year")).body), ["UC-UCD-DS"]);
    assert.deepEqual(ids((await get("/explorer/courses?studyMode=full-time")).body).sort(), ["UC-RWTH-ME", "UC-TUM-AI"]);
    assert.deepEqual(ids((await get("/explorer/courses?subject=Biology")).body), ["UC-TUD-BIO"]);
    assert.deepEqual(ids((await get("/explorer/courses?maxTuition=10000")).body), ["UC-TUM-AI"]);
    assert.deepEqual(ids((await get("/explorer/courses?deadlineMonth=7")).body), ["UC-RWTH-ME"]);
    assert.deepEqual(ids((await get("/explorer/courses?maxIelts=6.5")).body).sort(), ["UC-TUM-AI", "UC-UCD-DS"]);
    assert.deepEqual(ids((await get("/explorer/courses?requirement=GRE")).body), ["UC-TUM-AI"]);
    assert.deepEqual(ids((await get("/explorer/courses?applicationMethod=uni-assist")).body), ["UC-RWTH-ME"]);
  });

  test("courses: sorting and operator injection", async () => {
    assert.deepEqual(ids((await get("/explorer/courses?sort=tuition")).body).slice(0, 2), ["UC-TUM-AI", "UC-UCD-DS"]);
    assert.equal(ids((await get("/explorer/courses?sort=name")).body)[0], "UC-TUD-BIO");
    const injected = await get("/explorer/courses?country[$ne]=x");
    assert.equal(injected.body.total, 4, "non-string filter values are ignored");
  });

  // ---------- details ----------

  test("university details include programmes and country admission info", async () => {
    const { status, body } = await get("/explorer/universities/DEU-001");
    assert.equal(status, 200);
    assert.deepEqual(body.data.programmes.map((item) => item.id), ["UC-TUM-AI"]);
    assert.equal(body.data.countryInfo.name, "Germany");
    assert.equal((await get("/explorer/universities/NOPE")).status, 404);
  });

  test("course details include the university", async () => {
    const { body } = await get("/explorer/courses/UC-UCD-DS");
    assert.equal(body.data.universityId.id, "IRL-001");
    assert.equal(body.data.countryInfo, null);
    assert.equal((await get("/explorer/courses/NOPE")).status, 404);
  });

  test("items returns requested records in order for compare / presentation", async () => {
    const { body } = await get("/explorer/items?universities=IRL-001,DEU-001,MISSING&courses=UC-UCD-DS,UC-TUM-AI");
    assert.deepEqual(body.data.universities.map((item) => item.id), ["IRL-001", "DEU-001"]);
    assert.deepEqual(body.data.courses.map((item) => item.id), ["UC-UCD-DS", "UC-TUM-AI"]);
    assert.equal(body.data.courses[0].universityId.name, "University College Dublin");
    assert.equal((await get("/explorer/items")).status, 400);
  });

  // ---------- data management ----------

  test("new universities and programmes are tagged; programmes link by university id", async () => {
    const university = await post("/universities", {
      id: "DEU-099", name: "Hochschule Example", country: "Germany", city: "Berlin", popularCourses: ["Machine Learning"],
    });
    assert.equal(university.status, 201);
    assert.deepEqual(university.body.data.searchTags, ["machine learning"]);

    const programme = await post("/university-courses", {
      id: "UC-NEW", courseName: "MSc Robotics", universityExternalId: "DEU-099", customSearchTags: ["Drones"],
    });
    assert.equal(programme.status, 201);
    assert.equal(programme.body.data.universityName, "Hochschule Example");
    assert.ok(programme.body.data.universityId);

    const found = await get("/explorer/courses?q=drones&city=Berlin");
    assert.deepEqual(ids(found.body), ["UC-NEW"]);

    const missing = await post("/university-courses", { courseName: "X", universityExternalId: "NOPE" });
    assert.equal(missing.status, 400);
  });

  test("existing endpoints are unchanged", async () => {
    const { body } = await get("/universities");
    assert.equal(body.count, 5);
    const programmes = await get("/university-courses");
    assert.equal(programmes.body.count, 5);
  });
});
