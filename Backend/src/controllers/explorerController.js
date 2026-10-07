const mongoose = require("mongoose");
const University = require("../models/University");
const UniversityCourse = require("../models/UniversityCourse");
const Country = require("../models/Country");
const { escapeRegex } = require("../utils/searchText");
const { parsePaging, searchCollection } = require("../services/courseSearch");

// ======================================================
// University & Course Explorer
//
// Read-only endpoints for the counsellor explorer page. Search, filters,
// sorting and pagination all run in MongoDB through the shared
// searchCollection (related search tags included); this file only turns
// query parameters into filters. Every filter is optional and ignores
// values that are not plain strings, so operators cannot be injected.
// ======================================================

const DEFAULT_LIMIT = 24;
const MAX_ITEMS = 20;

// Large internal/import fields never needed by the explorer
const UNIVERSITY_EXCLUDE = [
  "sourceRow",
  "linkedSheetRows",
  "extraFields",
  "duplicateSourceRows",
  "importSource",
  "sheet2Data",
  "sheet2DuplicateRows",
  "searchTags",
  "customSearchTags",
];
const COURSE_EXCLUDE = ["sourceRow", "searchTags", "customSearchTags"];

const UNIVERSITY_SUMMARY =
  "id name city state country universityType website portal ranking rankingSource";

const COURSE_POPULATE = [{ path: "universityId", select: UNIVERSITY_SUMMARY }];

// English and German month names, for free-text deadlines
// ("15 Jul 2027", "January-May", "15.07.", "2027-07-15")
const MONTHS = [
  ["january", "jan", "januar"],
  ["february", "feb", "februar"],
  ["march", "mar", "marz", "märz"],
  ["april", "apr"],
  ["may", "mai"],
  ["june", "jun", "juni"],
  ["july", "jul", "juli"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct", "okt", "oktober"],
  ["november", "nov"],
  ["december", "dec", "dez", "dezember"],
];

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const sendError = (res, error, fallback) =>
  res.status(error.status ?? 500).json({
    success: false,
    message: error.status ? error.message : fallback,
    error: error.message,
  });

// ---------- query parameter helpers ----------

const str = (query, key) => {
  const value = query[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : undefined;
};

const num = (query, key) => {
  const value = Number(str(query, key));
  return Number.isFinite(value) ? value : undefined;
};

const containsRegex = (value) => ({ $regex: escapeRegex(value), $options: "i" });

/** Whole word, so "English" does not match "Englishes" and "German" matches "German, English". */
const wordRegex = (value) => ({ $regex: `(^|[^a-z])${escapeRegex(value)}([^a-z]|$)`, $options: "i" });

function monthRegex(month) {
  const index = Number(month) - 1;
  if (!MONTHS[index]) return undefined;

  const number = String(index + 1);
  return {
    $regex: `\\b(${MONTHS[index].join("|")})\\b|\\.0?${number}\\.|-0?${number}-`,
    $options: "i",
  };
}

/** First number in a free-text field ("6.5", "IELTS 6.5 overall") as a double, else null. */
const firstNumber = (field) => ({
  $let: {
    vars: {
      found: {
        $regexFind: { input: { $toString: { $ifNull: [`$${field}`, ""] } }, regex: "\\d+(\\.\\d+)?" },
      },
    },
    in: { $convert: { input: "$$found.match", to: "double", onError: null, onNull: null } },
  },
});

/** "Requires at most X": records without a number are excluded, not treated as 0. */
const maxNumber = (field, max) => ({
  $expr: { $and: [{ $ne: [firstNumber(field), null] }, { $lte: [firstNumber(field), max] }] },
});

const idsFilter = (ids) => {
  const objectIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  return { $or: [{ id: { $in: ids } }, ...(objectIds.length ? [{ _id: { $in: objectIds } }] : [])] };
};

const idList = (value) =>
  typeof value === "string"
    ? [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, MAX_ITEMS)
    : [];

const and = (conditions) => {
  const list = conditions.filter(Boolean);
  return list.length ? { $and: list } : {};
};

// ---------- filters ----------

/** Filters that live on the University document. */
function universityConditions(query) {
  const country = str(query, "country");
  const city = str(query, "city");
  const state = str(query, "state");
  const universityType = str(query, "universityType");

  return [
    country && { country },
    city && { city },
    state && { state },
    universityType && { universityType },
  ];
}

/** Filters that live on the UniversityCourse (programme) document. */
function programmeConditions(query) {
  const degree = str(query, "degree");
  const subject = str(query, "subject");
  const specialization = str(query, "specialization");
  const language = str(query, "language");
  const intake = str(query, "intake");
  const studyMode = str(query, "studyMode");
  const duration = str(query, "duration");

  return [
    degree && { degree },
    subject && { $or: [{ subjectArea: subject }, { canonicalCourse: subject }] },
    specialization && { specialization },
    language && { language: wordRegex(language) },
    intake && { intake: containsRegex(intake) },
    studyMode && { studyMode },
    duration && { duration },
  ];
}

const hasProgrammeFilter = (query) => programmeConditions(query).some(Boolean);

async function courseFilter(query) {
  const conditions = [...programmeConditions(query)];

  // University-level filters -> the universities' ids (a few hundred at most)
  const country = str(query, "country");
  const universityType = str(query, "universityType");
  if (country || universityType) {
    const ids = await University.distinct("_id", and([country && { country }, universityType && { universityType }]));
    conditions.push({ universityId: { $in: ids } });
  }

  // Location: the programme's own city/state, or its university's
  for (const field of ["city", "state"]) {
    const value = str(query, field);
    if (value) {
      const ids = await University.distinct("_id", { [field]: value });
      conditions.push({ $or: [{ [field]: value }, { universityId: { $in: ids } }] });
    }
  }

  const applicationMethod = str(query, "applicationMethod");
  if (applicationMethod) {
    const ids = await University.distinct("_id", { portal: applicationMethod });
    conditions.push({ $or: [{ applicationMethod }, { universityId: { $in: ids } }] });
  }

  const maxTuition = num(query, "maxTuition");
  if (maxTuition !== undefined) {
    conditions.push({
      $or: [
        { tuitionMax: { $lte: maxTuition } },
        { tuitionMax: { $exists: false }, tuitionMin: { $lte: maxTuition } },
      ],
    });
  }

  const deadline = monthRegex(str(query, "deadlineMonth"));
  if (deadline) conditions.push({ applicationDeadline: deadline });

  const maxIelts = num(query, "maxIelts");
  if (maxIelts !== undefined) conditions.push(maxNumber("ielts", maxIelts));

  const requirement = str(query, "requirement");
  if (requirement) {
    const regex = containsRegex(requirement);
    conditions.push({
      $or: [
        { eligibility: regex },
        { requirements: regex },
        { requiredDegree: regex },
        { entranceExam: regex },
        { gre: regex },
      ],
    });
  }

  return and(conditions);
}

async function universityFilter(query) {
  const conditions = [...universityConditions(query)];

  // Programme-level filters -> universities that offer a matching programme
  if (hasProgrammeFilter(query)) {
    const programmeOnly = { ...query, subject: undefined };
    const subject = str(query, "subject");
    const ids = hasProgrammeFilter(programmeOnly)
      ? await UniversityCourse.distinct("universityId", and(programmeConditions(programmeOnly)))
      : null;

    if (ids) conditions.push({ _id: { $in: ids } });

    // Subject also matches the university's own popular courses
    if (subject) {
      const subjectIds = await UniversityCourse.distinct("universityId", {
        $or: [{ subjectArea: subject }, { canonicalCourse: subject }],
      });
      conditions.push({ $or: [{ popularCourses: subject }, { _id: { $in: subjectIds } }] });
    }
  }

  const applicationMethod = str(query, "applicationMethod");
  if (applicationMethod) {
    const ids = await UniversityCourse.distinct("universityId", { applicationMethod });
    conditions.push({ $or: [{ portal: applicationMethod }, { _id: { $in: ids } }] });
  }

  const maxTuition = num(query, "maxTuition");
  if (maxTuition !== undefined) {
    conditions.push({
      $or: [
        { tuitionFeeMax: { $lte: maxTuition } },
        { tuitionFeeMax: { $exists: false }, tuitionFeeMin: { $lte: maxTuition } },
      ],
    });
  }

  const deadline = monthRegex(str(query, "deadlineMonth"));
  if (deadline) conditions.push({ applicationDeadline: deadline });

  const intake = str(query, "intake");
  if (intake) conditions.push({ $or: [{ intake: containsRegex(intake) }, { applicationOpens: containsRegex(intake) }] });

  const maxIelts = num(query, "maxIelts");
  if (maxIelts !== undefined) conditions.push(maxNumber("englishRequirement", maxIelts));

  const requirement = str(query, "requirement");
  if (requirement) {
    const regex = containsRegex(requirement);
    conditions.push({
      $or: [{ requirements: regex }, { englishRequirement: regex }, { aps: regex }, { documents: regex }],
    });
  }

  return and(conditions);
}

// ---------- sorting ----------

const LAST = 1e12; // missing values sort after every real value

const COURSE_SORTS = {
  name: { addFields: { _sortName: { $toLower: { $ifNull: ["$courseName", ""] } } }, sort: { _sortName: 1 } },
  tuition: {
    addFields: { _sortTuition: { $ifNull: ["$tuitionMin", { $ifNull: ["$tuitionMax", LAST] }] } },
    sort: { _sortTuition: 1 },
  },
  newest: { addFields: null, sort: { createdAt: -1 } },
};

const UNIVERSITY_SORTS = {
  name: { addFields: { _sortName: { $toLower: { $ifNull: ["$name", ""] } } }, sort: { _sortName: 1 } },
  tuition: {
    addFields: { _sortTuition: { $ifNull: ["$tuitionFeeMin", { $ifNull: ["$tuitionFeeMax", LAST] }] } },
    sort: { _sortTuition: 1 },
  },
  ranking: {
    addFields: { _sortRanking: { $ifNull: [firstNumber("ranking"), LAST] } },
    sort: { _sortRanking: 1 },
  },
  newest: { addFields: null, sort: { createdAt: -1 } },
};

/** Default: relevance when searching, otherwise A-Z (newest first is a choice). */
function sortOptions(sorts, query) {
  const choice = sorts[str(query, "sort")] ?? (str(query, "q") ? null : sorts.name);
  return choice ? { sort: choice.sort, addFields: choice.addFields } : {};
}

const paging = (query) => parsePaging({ page: query.page ?? "1", limit: query.limit ?? String(DEFAULT_LIMIT) });

// ---------- enrichment ----------

async function programmeCounts(universityIds) {
  if (!universityIds.length) return new Map();

  const counts = await UniversityCourse.aggregate([
    { $match: { universityId: { $in: universityIds } } },
    { $group: { _id: "$universityId", count: { $sum: 1 } } },
  ]);

  return new Map(counts.map(({ _id, count }) => [String(_id), count]));
}

async function withProgrammeCounts(universities) {
  const counts = await programmeCounts(universities.map((university) => university._id));
  return universities.map((university) => ({
    ...university,
    programmeCount: counts.get(String(university._id)) ?? 0,
  }));
}

async function countryInfo(name) {
  if (!name) return null;
  return Country.findOne(
    { name },
    { _id: 0, name: 1, livingCostMin: 1, livingCostMax: 1, livingCostCurrency: 1, livingCostPeriod: 1, intakes: 1, admissionSteps: 1, requiredDocuments: 1 },
  ).lean();
}

const toPlain = (doc) => (typeof doc?.toObject === "function" ? doc.toObject() : doc);

// ======================================================
// HANDLERS
// ======================================================

// GET /explorer/courses?q=&country=&city=&degree=&...&sort=&page=&limit=
const searchCourses = async (req, res) => {
  try {
    const result = await searchCollection(UniversityCourse, {
      q: req.query.q,
      filter: await courseFilter(req.query),
      paging: paging(req.query),
      populate: COURSE_POPULATE,
      exclude: COURSE_EXCLUDE,
      ...sortOptions(COURSE_SORTS, req.query),
    });

    res.status(200).json({ success: true, count: result.data.length, ...result, data: result.data.map(toPlain) });
  } catch (error) {
    sendError(res, error, "Failed to search courses");
  }
};

// GET /explorer/universities?q=&country=&city=&universityType=&...&sort=&page=&limit=
const searchUniversities = async (req, res) => {
  try {
    const result = await searchCollection(University, {
      q: req.query.q,
      filter: await universityFilter(req.query),
      paging: paging(req.query),
      exclude: UNIVERSITY_EXCLUDE,
      ...sortOptions(UNIVERSITY_SORTS, req.query),
    });

    const data = await withProgrammeCounts(result.data.map(toPlain));

    res.status(200).json({ success: true, count: data.length, ...result, data });
  } catch (error) {
    sendError(res, error, "Failed to search universities");
  }
};

const sortedValues = (values) =>
  [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
  );

/** "German, English" / "English and German" -> ["German", "English"] (also used for intakes) */
const splitLanguages = (values) =>
  values.flatMap((value) => String(value).split(/\s*(?:,|\/|;|\band\b|\bund\b)\s*/i));

/** "September 2027" -> "September"; keeps "Winter semester" as it is. */
const intakeLabels = (values) =>
  values.map((value) => String(value).replace(/\b(19|20)\d{2}(\/\d{2,4})?\b/g, "").replace(/[\s,.-]+$/, "").trim());

// GET /explorer/facets -> the values that exist for every filter (data-driven)
const getFacets = async (req, res) => {
  try {
    const distinct = (Model, field) => Model.distinct(field);

    const [
      countries, universityCities, universityStates, universityTypes, portals, popularCourses, universityIntakes,
      degrees, subjectAreas, canonicalCourses, specializations, languages, intakes, studyModes, durations,
      applicationMethods, programmeCities, programmeStates,
    ] = await Promise.all([
      distinct(University, "country"),
      distinct(University, "city"),
      distinct(University, "state"),
      distinct(University, "universityType"),
      distinct(University, "portal"),
      distinct(University, "popularCourses"),
      distinct(University, "intake"),
      distinct(UniversityCourse, "degree"),
      distinct(UniversityCourse, "subjectArea"),
      distinct(UniversityCourse, "canonicalCourse"),
      distinct(UniversityCourse, "specialization"),
      distinct(UniversityCourse, "language"),
      distinct(UniversityCourse, "intake"),
      distinct(UniversityCourse, "studyMode"),
      distinct(UniversityCourse, "duration"),
      distinct(UniversityCourse, "applicationMethod"),
      distinct(UniversityCourse, "city"),
      distinct(UniversityCourse, "state"),
    ]);

    res.status(200).json({
      success: true,
      data: {
        countries: sortedValues(countries),
        cities: sortedValues([...universityCities, ...programmeCities]),
        states: sortedValues([...universityStates, ...programmeStates]),
        universityTypes: sortedValues(universityTypes),
        degrees: sortedValues(degrees),
        subjects: sortedValues([...subjectAreas, ...canonicalCourses, ...popularCourses]),
        specializations: sortedValues(specializations),
        languages: sortedValues(splitLanguages(languages)),
        // "Winter semester, Summer semester" -> two options (the filter matches either)
        intakes: sortedValues(intakeLabels(splitLanguages([...intakes, ...universityIntakes]))),
        studyModes: sortedValues(studyModes),
        durations: sortedValues(durations),
        applicationMethods: sortedValues([...applicationMethods, ...portals]),
      },
    });
  } catch (error) {
    sendError(res, error, "Failed to load filters");
  }
};

// GET /explorer/universities/:id -> university, its programmes and country admission info
const getUniversityDetails = async (req, res) => {
  try {
    const university = await University.findOne(idsFilter([req.params.id]))
      .select(UNIVERSITY_EXCLUDE.map((field) => `-${field}`).join(" "))
      .lean();
    if (!university) throw new RequestError("University not found", 404);

    const [programmes, country] = await Promise.all([
      UniversityCourse.find({ universityId: university._id })
        .select(COURSE_EXCLUDE.map((field) => `-${field}`).join(" "))
        .sort({ courseName: 1 })
        .limit(500)
        .lean(),
      countryInfo(university.country),
    ]);

    res.status(200).json({
      success: true,
      data: { ...university, programmeCount: programmes.length, programmes, countryInfo: country },
    });
  } catch (error) {
    sendError(res, error, "Failed to load university");
  }
};

// GET /explorer/courses/:id -> programme with its university and country admission info
const getCourseDetails = async (req, res) => {
  try {
    const course = await UniversityCourse.findOne(idsFilter([req.params.id]))
      .select(COURSE_EXCLUDE.map((field) => `-${field}`).join(" "))
      .populate({ path: "universityId", select: `${UNIVERSITY_SUMMARY} englishRequirement applicationFee aps scholarship partTime postStudyWork` })
      .lean();
    if (!course) throw new RequestError("Course not found", 404);

    const country = await countryInfo(course.universityId?.country);

    res.status(200).json({ success: true, data: { ...course, countryInfo: country } });
  } catch (error) {
    sendError(res, error, "Failed to load course");
  }
};

// GET /explorer/items?universities=DEU-001,DEU-002&courses=UC-1 -> for compare / presentation
const getItems = async (req, res) => {
  try {
    const universityIds = idList(req.query.universities);
    const courseIds = idList(req.query.courses);

    if (!universityIds.length && !courseIds.length) {
      throw new RequestError("Pass universities and/or courses as comma-separated ids");
    }

    const [universities, courses] = await Promise.all([
      universityIds.length
        ? University.find(idsFilter(universityIds)).select(UNIVERSITY_EXCLUDE.map((field) => `-${field}`).join(" ")).lean()
        : [],
      courseIds.length
        ? UniversityCourse.find(idsFilter(courseIds))
            .select(COURSE_EXCLUDE.map((field) => `-${field}`).join(" "))
            .populate(COURSE_POPULATE)
            .lean()
        : [],
    ]);

    // Same order as requested
    const order = (ids, docs) =>
      ids.map((id) => docs.find((doc) => doc.id === id || String(doc._id) === id)).filter(Boolean);

    res.status(200).json({
      success: true,
      data: {
        universities: await withProgrammeCounts(order(universityIds, universities)),
        courses: order(courseIds, courses),
      },
    });
  } catch (error) {
    sendError(res, error, "Failed to load items");
  }
};

module.exports = {
  searchCourses,
  searchUniversities,
  getFacets,
  getUniversityDetails,
  getCourseDetails,
  getItems,
};
