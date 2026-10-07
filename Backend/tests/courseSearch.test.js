// Tests for the search tag dictionary and course search
//
//   npm test
//
// Unit tests need no database. The integration tests run only when
// MONGO_TEST_URI points to a LOCAL MongoDB (localhost / 127.0.0.1); they
// use a fresh, uniquely named database and drop only that database.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { normalizeTerm, compactTerm, stripDegree } = require("../src/utils/searchText");
const {
  buildDictionary,
  tagTexts,
  expandQuery,
  suggestionKeys,
} = require("../src/services/searchTagDictionary");

const n = normalizeTerm;

const SEED_FILE = path.join(__dirname, "..", "data", "search-tags.json");
const SEED_SCRIPT = path.join(__dirname, "..", "scripts", "seedSearchTags.js");

/** Dictionary from data/search-tags.json, built the same way as from MongoDB. */
function seedDictionary() {
  const { tags } = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  const docs = tags.map((tag, index) => ({
    _id: `id-${index}`,
    name: tag.name,
    key: n(tag.name),
    aliases: tag.aliases,
    status: "active",
  }));
  const idByName = new Map(docs.map((doc) => [doc.key, doc._id]));

  docs.forEach((doc, index) => {
    doc.related = [
      ...(tags[index].closelyRelated ?? []).map((name) => ({ tag: idByName.get(n(name)), relation: "closely_related" })),
      ...(tags[index].broaderRelated ?? []).map((name) => ({ tag: idByName.get(n(name)), relation: "broader_related" })),
    ];
  });

  return buildDictionary(docs);
}

const termsOf = (expansion, relation) =>
  expansion.expandedTerms.filter((item) => item.relation === relation).map((item) => item.term);


// ======================================================
// NORMALIZATION
// ======================================================

describe("normalizeTerm", () => {
  test("case, punctuation, whitespace and & / and variants", () => {
    assert.equal(normalizeTerm("  Artificial   Intelligence "), "artificial intelligence");
    assert.equal(normalizeTerm("artificial-intelligence"), "artificial intelligence");
    assert.equal(normalizeTerm("Artificial-Intelligence"), "artificial intelligence");
    assert.equal(normalizeTerm("AI & ML"), "ai ml");
    assert.equal(normalizeTerm("AI/ML"), "ai ml");
    assert.equal(normalizeTerm("AI and ML"), "ai ml");
    assert.equal(normalizeTerm("A.I."), "ai");
  });

  test("accents and German characters", () => {
    assert.equal(normalizeTerm("Künstliche Intelligenz"), "kunstliche intelligenz");
    assert.equal(normalizeTerm("Straße"), "strasse");
  });

  test("compact form joins words", () => {
    assert.equal(compactTerm("Gen AI"), "genai");
  });

  test("stripDegree removes degree prefixes and suffixes only", () => {
    assert.equal(stripDegree(normalizeTerm("MSc Artificial Intelligence")), "artificial intelligence");
    assert.equal(stripDegree(normalizeTerm("Master of Science in Data Science")), "data science");
    assert.equal(stripDegree(normalizeTerm("Informatik (M.Sc.)")), "informatik");
    assert.equal(stripDegree(normalizeTerm("MBA")), "mba");
  });
});


// ======================================================
// DICTIONARY
// ======================================================

describe("tagTexts", () => {
  const dictionary = seedDictionary();

  test("tags concepts found as whole words", () => {
    assert.deepEqual(tagTexts(dictionary, ["MSc Artificial Intelligence"]), ["artificial intelligence"]);
    assert.deepEqual(tagTexts(dictionary, ["MSc Data Science"]), ["data science"]);
    assert.deepEqual(tagTexts(dictionary, ["Künstliche Intelligenz (M.Sc.)"]), ["artificial intelligence"]);
  });

  test("a combined name gets every concept it contains", () => {
    const tags = tagTexts(dictionary, ["MSc Artificial Intelligence and Machine Learning"]);
    assert.ok(tags.includes("artificial intelligence machine learning"));
    assert.ok(tags.includes("artificial intelligence"));
    assert.ok(tags.includes("machine learning"));
  });

  test("does not match inside words", () => {
    // "it" (Information Technology) must not match "Wirtschaftsinformatik" or "with"
    assert.deepEqual(tagTexts(dictionary, ["Studies with Robots"]), []);
    assert.deepEqual(tagTexts(dictionary, ["Wirtschaftsinformatik"]), ["business informatics"]);
  });
});

describe("expandQuery", () => {
  const dictionary = seedDictionary();

  test("AI resolves to Artificial Intelligence with aliases, close and broader terms", () => {
    const expansion = expandQuery(dictionary, "AI");

    assert.deepEqual(expansion.concepts.map((item) => item.name), ["Artificial Intelligence"]);
    assert.equal(expansion.concepts[0].via, "exact");
    assert.ok(termsOf(expansion, "alias").includes("AI"));
    assert.ok(termsOf(expansion, "closely_related").includes("Machine Learning"));
    assert.ok(termsOf(expansion, "closely_related").includes("Generative AI"));
    assert.ok(termsOf(expansion, "broader_related").includes("Data Science"));

    assert.equal(expansion.tiers.get("artificial intelligence").score, 80);
    assert.equal(expansion.tiers.get("machine learning").score, 60);
    assert.equal(expansion.tiers.get("data science").score, 35);
  });

  test("AI does not expand to Computer Science, IT or Software Engineering", () => {
    const expansion = expandQuery(dictionary, "AI");

    for (const key of ["computer science", "information technology", "software engineering"]) {
      assert.ok(!expansion.tiers.has(key), `${key} must not be part of an AI search`);
    }
  });

  test("relations are followed one level only", () => {
    // AI -> Data Science (broader); Data Science -> Bioinformatics must not follow
    assert.ok(!expandQuery(dictionary, "AI").tiers.has("bioinformatics"));
  });

  test("spelling variants resolve to the same concept", () => {
    for (const query of ["ai", " AI ", "artificial-intelligence", "Artificial Intelligence", "A.I.", "MSc AI"]) {
      assert.equal(expandQuery(dictionary, query).concepts[0]?.name, "Artificial Intelligence", query);
    }
    for (const query of ["AI & ML", "AI/ML", "aiml", "AI and ML"]) {
      assert.equal(expandQuery(dictionary, query).concepts[0]?.name, "Artificial Intelligence and Machine Learning", query);
    }
    assert.equal(expandQuery(dictionary, "Gen AI").concepts[0].name, "Generative AI");
    assert.equal(expandQuery(dictionary, "genai").concepts[0].name, "Generative AI");
  });

  test("known terms inside a longer query are used", () => {
    const expansion = expandQuery(dictionary, "machine learning in germany");
    assert.deepEqual(expansion.concepts, [{ key: "machine learning", name: "Machine Learning", via: "partial" }]);
  });

  test("small typos are corrected, short or unrelated words are not", () => {
    assert.equal(expandQuery(dictionary, "Artifical Intelligence").concepts[0].name, "Artificial Intelligence");
    assert.equal(expandQuery(dictionary, "Artifical Intelligence").concepts[0].via, "fuzzy");
    assert.equal(expandQuery(dictionary, "Machin Learning").concepts[0].name, "Machine Learning");
    assert.deepEqual(expandQuery(dictionary, "ao").concepts, []);
    assert.deepEqual(expandQuery(dictionary, "xyzzy quantum basket").concepts, []);
  });

  test("unknown terms still search for themselves", () => {
    const expansion = expandQuery(dictionary, "Underwater Basket Weaving");
    assert.deepEqual(expansion.concepts, []);
    assert.deepEqual([...expansion.tiers.keys()], ["underwater basket weaving"]);
  });

  test("empty queries expand to nothing", () => {
    assert.equal(expandQuery(dictionary, "   "), null);
    assert.equal(expandQuery(dictionary, "&&"), null);
  });

  test("suggestions include prefix matches", () => {
    const keys = suggestionKeys(dictionary, expandQuery(dictionary, "generat"));
    assert.ok(keys.includes("generative ai"));
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

describe("course search against a local MongoDB", { skip }, () => {
  const mongoose = require("mongoose");
  const app = require("../src/app");
  const Course = require("../src/models/Course");
  const UniversityCourse = require("../src/models/UniversityCourse");
  const SearchTag = require("../src/models/SearchTag");
  const SearchLog = require("../src/models/SearchLog");
  const { invalidateDictionary } = require("../src/services/searchTagDictionary");

  const dbName = `edupath_search_test_${Date.now()}`;
  const uri = (() => {
    const url = new URL(TEST_URI);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();

  let server;
  let baseUrl;

  const api = async (pathname, options = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };

  const names = (body) => body.data.map((course) => course.name ?? course.courseName);

  const seed = (...flags) =>
    execFileSync(process.execPath, [SEED_SCRIPT, ...flags], {
      env: { ...process.env, MONGO_URI: uri },
      stdio: "pipe",
    }).toString();

  before(async () => {
    await mongoose.connect(uri);

    // A course saved before search tags existed: raw insert, no search fields
    await Course.collection.insertOne({
      id: "CRS-LEGACY",
      name: "MSc Artificial Intelligence (legacy)",
      country: "Canada",
      specialization: "Artificial Intelligence",
      status: "Active",
      createdAt: new Date("2020-01-01"),
    });

    await Course.create([
      { id: "CRS-AI", name: "MSc Artificial Intelligence", specialization: "Artificial Intelligence", country: "Canada", degree: "MSc", status: "Active" },
      { id: "CRS-DS", name: "MSc Data Science", specialization: "Data Science", country: "Ireland", degree: "MSc", status: "Active" },
      { id: "CRS-ML", name: "MSc Machine Learning", specialization: "Machine Learning", country: "Germany", degree: "MSc", status: "Draft" },
      { id: "CRS-AIML", name: "MSc AI & ML", specialization: "AI and ML", country: "India", degree: "MSc", status: "Active" },
      { id: "CRS-CS", name: "MSc Computer Science", specialization: "Computer Science", country: "Germany", degree: "MSc", status: "Active" },
      { id: "CRS-MBA", name: "MBA", specialization: "General Management", country: "United Kingdom", degree: "MBA", status: "Active" },
    ]);
  });

  after(async () => {
    server?.close();
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });

  test("before seeding, search falls back to text and old records still work", async () => {
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    const all = await api("/courses");
    assert.equal(all.status, 200);
    assert.equal(all.body.count, 7, "no params returns every course, as before");
    assert.equal(all.body.search, null);

    const text = await api("/courses?q=intelligence");
    assert.deepEqual(names(text.body).sort(), ["MSc Artificial Intelligence", "MSc Artificial Intelligence (legacy)"]);
  });

  test("seed script creates the dictionary, backfills courses and is idempotent", async () => {
    const dry = seed("--dry-run");
    assert.match(dry, /Would create:\s+35/);
    assert.equal(await SearchTag.countDocuments(), 0, "dry run writes nothing");

    const first = seed();
    assert.match(first, /Created:\s+35/);
    assert.match(first, /Course: 7 scanned, 7 retagged/);

    const second = seed();
    assert.match(second, /Created:\s+0/);
    assert.match(second, /Updated:\s+0/);
    assert.match(second, /Course: 7 scanned, 0 retagged/);
    assert.equal(await SearchTag.countDocuments(), 35);

    const legacy = await Course.findOne({ id: "CRS-LEGACY" }).lean();
    assert.deepEqual(legacy.searchTags, ["artificial intelligence"]);
    invalidateDictionary();
  });

  test("AI: exact concept first, related next, broader last; CS and MBA excluded", async () => {
    const { body } = await api("/courses?q=AI");
    const result = names(body);

    assert.equal(body.total, 5);
    assert.deepEqual(result.slice(0, 2).sort(), ["MSc Artificial Intelligence", "MSc Artificial Intelligence (legacy)"]);
    assert.ok(result.indexOf("MSc Machine Learning") > 1);
    assert.equal(result.at(-1), "MSc Data Science");
    assert.ok(!result.includes("MSc Computer Science"));
    assert.ok(!result.includes("MBA"));

    assert.deepEqual(body.search.concepts, [{ name: "Artificial Intelligence", via: "exact" }]);
    assert.ok(body.search.relatedTermCount > 5);

    const ds = body.data.find((course) => course.name === "MSc Data Science");
    assert.equal(ds.searchMatch.type, "broader");
    assert.deepEqual(ds.searchMatch.matchedTags.map((tag) => tag.name), ["Data Science"]);

    const ai = body.data.find((course) => course.name === "MSc Artificial Intelligence");
    assert.equal(ai.searchMatch.type, "exact", "specialization equals a synonym of AI");
    assert.ok(!("searchName" in ai), "internal fields are not returned");
  });

  test("Artificial Intelligence: exact name match ranks first", async () => {
    const { body } = await api("/courses?q=Artificial%20Intelligence");
    assert.equal(body.data[0].name, "MSc Artificial Intelligence");
    assert.equal(body.data[0].searchMatch.type, "exact");
  });

  test("AI & ML, Machine Learning and Data Science", async () => {
    const aiml = await api("/courses?q=" + encodeURIComponent("AI & ML"));
    assert.equal(names(aiml.body)[0], "MSc AI & ML");

    const ml = await api("/courses?q=machine%20learning");
    assert.equal(names(ml.body)[0], "MSc Machine Learning");
    assert.ok(names(ml.body).includes("MSc Artificial Intelligence"));

    const ds = await api("/courses?q=Data%20Science");
    assert.equal(names(ds.body)[0], "MSc Data Science");
    assert.ok(!names(ds.body).includes("MSc Computer Science"));
  });

  test("case and whitespace differences give the same results", async () => {
    const a = await api("/courses?q=AI");
    const b = await api("/courses?q=" + encodeURIComponent("  ai  "));
    assert.deepEqual(names(a.body), names(b.body));
  });

  test("no duplicates when a course matches several ways", async () => {
    const { body } = await api("/courses?q=AI");
    const ids = body.data.map((course) => course.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("filters combine with search; pagination keeps the ranking", async () => {
    const active = await api("/courses?q=AI&status=Active");
    assert.ok(!names(active.body).includes("MSc Machine Learning"));
    assert.ok(active.body.data.every((course) => course.status === "Active"));

    const country = await api("/courses?q=AI&country=Ireland");
    assert.deepEqual(names(country.body), ["MSc Data Science"]);

    const full = names((await api("/courses?q=AI")).body);
    const page1 = await api("/courses?q=AI&page=1&limit=2");
    const page2 = await api("/courses?q=AI&page=2&limit=2");
    assert.equal(page1.body.total, 5);
    assert.deepEqual([...names(page1.body), ...names(page2.body)], full.slice(0, 4));

    const plain = await api("/courses?page=2&limit=3");
    assert.equal(plain.body.total, 7);
    assert.equal(plain.body.count, 3);
  });

  test("nonexistent term returns nothing, logs a zero-result search", async () => {
    const { body } = await api("/courses?q=underwater%20basket%20weaving");
    assert.equal(body.total, 0);
    assert.deepEqual(body.search.concepts, []);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const log = await SearchLog.findOne({ key: "underwater basket weaving" }).lean();
    assert.equal(log.zeroResultCount, 1);

    const analytics = await api("/search-tags/analytics?scope=courses");
    assert.ok(analytics.body.data.zeroResultSearches.some((item) => item.key === "underwater basket weaving"));
  });

  test("typo search is corrected; zero-result search suggests terms that have courses", async () => {
    const typo = await api("/courses?q=Artifical%20Intelligence");
    assert.equal(typo.body.search.correctedTo, "Artificial Intelligence");
    assert.ok(names(typo.body).includes("MSc Artificial Intelligence"));

    const none = await api("/courses?q=generativ&country=Canada");
    assert.equal(none.body.total, 0);
    assert.ok(none.body.search.suggestions.some((item) => item.term === "Artificial Intelligence" && item.count === 2));
  });

  test("empty search lists everything", async () => {
    const { body } = await api("/courses?q=%20%20");
    assert.equal(body.total, 7);
    assert.equal(body.search, null);

    // Punctuation is searched literally (and escaped), not treated as empty
    const punctuation = await api("/courses?q=" + encodeURIComponent("(.*"));
    assert.equal(punctuation.body.total, 0);
    const ampersand = await api("/courses?q=" + encodeURIComponent("&"));
    assert.deepEqual(names(ampersand.body), ["MSc AI & ML"]);
  });

  test("a newly created course is tagged and searchable, custom tags included", async () => {
    const zeroed = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const { body } = await api("/search-tags/analytics?scope=courses");
      return body.data.zeroResultSearches.map((item) => item.key);
    };

    assert.equal((await api("/courses?q=drones")).body.total, 0);
    assert.ok((await zeroed()).includes("drones"));

    const created = await api("/courses", {
      method: "POST",
      body: { name: "MSc Robotics Systems", country: "Germany", status: "Active", customSearchTags: ["Drones", " drones ", "AI"] },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.data.customSearchTags, ["Drones", "AI"]);
    assert.deepEqual(created.body.data.searchTags.sort(), ["artificial intelligence", "drones", "robotics"]);

    const drones = await api("/courses?q=drones");
    assert.deepEqual(names(drones.body), ["MSc Robotics Systems"]);
    assert.equal(drones.body.data[0].searchMatch.matchedTags[0].name, "Drones");
    assert.ok(!(await zeroed()).includes("drones"), "a term that now finds courses leaves the list");

    // PATCH (findOneAndUpdate) recomputes the tags
    const updated = await api(`/courses/${created.body.data.id ?? created.body.data._id}`, {
      method: "PATCH",
      body: { customSearchTags: [] },
    });
    assert.deepEqual(updated.body.data.searchTags, ["robotics"]);

    const tooMany = await api(`/courses/${created.body.data._id}`, {
      method: "PATCH",
      body: { customSearchTags: ["x".repeat(61)] },
    });
    assert.equal(tooMany.status, 400);
  });

  test("dictionary edits retag courses and reject duplicate terms", async () => {
    const ai = (await api("/search-tags/artificial%20intelligence")).body.data;

    const duplicate = await api("/search-tags", { method: "POST", body: { name: "A.I." } });
    assert.equal(duplicate.status, 409);

    const created = await api("/search-tags", {
      method: "POST",
      body: { name: "Drone Technology", aliases: ["Drones", "UAV"], related: [{ tag: ai._id, relation: "broader_related" }] },
    });
    assert.equal(created.status, 201);

    // Robotics course has custom tag "Drones" -> now resolved to the new concept
    await api(`/courses/${(await Course.findOne({ name: "MSc Robotics Systems" }))._id}`, {
      method: "PATCH",
      body: { customSearchTags: ["Drones"] },
    });
    const uav = await api("/courses?q=UAV");
    assert.equal(names(uav.body)[0], "MSc Robotics Systems");
    assert.equal(uav.body.data[0].searchMatch.type, "tag");
    // The new tag's broader relation to AI pulls AI courses in, ranked below
    assert.ok(uav.body.data.slice(1).every((course) => course.searchMatch.type === "broader"));

    const renamed = await api(`/search-tags/${created.body.data._id}`, {
      method: "PATCH",
      body: { name: "Unmanned Aerial Systems" },
    });
    assert.equal(renamed.status, 200);
    const course = await Course.findOne({ name: "MSc Robotics Systems" }).lean();
    assert.ok(course.searchTags.includes("unmanned aerial systems"));

    const removed = await api(`/search-tags/${created.body.data._id}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const after = await Course.findOne({ name: "MSc Robotics Systems" }).lean();
    assert.ok(!after.searchTags.includes("unmanned aerial systems"));
    assert.ok(after.searchTags.includes("drones"), "custom tag falls back to its own text");

    const invalid = await api("/search-tags", { method: "POST", body: { name: "X", related: [{ tag: "nope", relation: "closely_related" }] } });
    assert.equal(invalid.status, 400);
  });

  test("university programmes: imported-style records are tagged and searchable with filters", async () => {
    await UniversityCourse.create([
      { id: "UC-1", courseName: "Künstliche Intelligenz", degree: "Master of Science", universityName: "TU Example", city: "Berlin", source: "hochschulkompass", sourceKey: "k:1" },
      { id: "UC-2", courseName: "Informatik", subjectArea: "Informatik", degree: "Master of Science", universityName: "TU Example", city: "Munich", source: "hochschulkompass", sourceKey: "k:2" },
      { id: "UC-3", courseName: "Data Science", degree: "Master of Science", universityName: "Uni Example", city: "Berlin" },
    ]);

    const ai = await api("/university-courses?q=AI");
    assert.deepEqual(names(ai.body), ["Künstliche Intelligenz", "Data Science"]);

    const berlin = await api("/university-courses?q=AI&city=Munich");
    assert.equal(berlin.body.total, 0);

    const byUniversity = await api("/university-courses?q=TU%20Example");
    assert.equal(byUniversity.body.total, 2);

    // Informatik is Computer Science (alias); AI and Data Science are broader relations of CS
    const cs = await api("/university-courses?q=computer%20science&page=1&limit=10");
    assert.equal(names(cs.body)[0], "Informatik");
    assert.equal(cs.body.data[0].searchMatch.type, "exact");
    assert.ok(cs.body.data.slice(1).every((course) => course.searchMatch.type === "broader"));
    assert.equal(cs.body.data[0].universityName, "TU Example");
  });
});
