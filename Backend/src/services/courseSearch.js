const SearchLog = require("../models/SearchLog");
const {
  getDictionary,
  tagTexts,
  resolveTerm,
  expandQuery,
  suggestionKeys,
} = require("./searchTagDictionary");
const { normalizeTerm, stripDegree, escapeRegex } = require("../utils/searchText");

// ======================================================
// Searchable courses
//
// `searchablePlugin` adds the search fields to a course-like schema and keeps
// them current on create / save / insertMany / findOneAndUpdate, so new
// courses (manual, seeded or imported) are tagged without extra code:
//
//   customSearchTags      tags an admin added by hand (display form)
//   searchTags            concept keys from the course's own text + custom tags
//   searchName            normalized name without degree ("artificial intelligence")
//   searchSpecialization  normalized specialization
//
// `searchCollection` runs the ranked, paginated search for both
// Course and UniversityCourse.
// ======================================================

const MAX_CUSTOM_TAGS = 30;
const MAX_TAG_LENGTH = 60;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const RETAG_BATCH = 500;

const valuesOf = (value) =>
  (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== undefined && item !== null && item !== "",
  );

/** Trim, collapse spaces and drop duplicates (compared normalized). */
function cleanCustomTags(tags) {
  const seen = new Set();

  return valuesOf(tags ?? [])
    .map((tag) => String(tag).replace(/\s+/g, " ").trim())
    .filter((tag) => {
      const key = normalizeTerm(tag);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Derived search fields for one course (document or lean object). */
function computeSearchFields(dictionary, doc, options) {
  const get = (field) => {
    if (!field) return undefined;
    return typeof doc.get === "function" ? doc.get(field) : doc[field];
  };

  const customSearchTags = cleanCustomTags(get("customSearchTags"));
  const texts = options.tagFields.flatMap((field) => valuesOf(get(field))).map(String);

  const searchTags = [
    ...new Set([
      ...tagTexts(dictionary, texts),
      ...customSearchTags.map((tag) => resolveTerm(dictionary, tag) ?? normalizeTerm(tag)),
    ]),
  ];

  return {
    customSearchTags,
    searchTags,
    searchName: stripDegree(normalizeTerm(get(options.nameField))),
    searchSpecialization: stripDegree(normalizeTerm(get(options.specializationField))),
  };
}

const sameFields = (doc, fields) =>
  Object.entries(fields).every(
    ([field, value]) => JSON.stringify(doc[field] ?? null) === JSON.stringify(value ?? null),
  );

/**
 * Mongoose plugin. options:
 *   scope                 name used in search analytics ("courses")
 *   nameField             course name field
 *   specializationField   specialization field
 *   tagFields             fields scanned for dictionary terms. Only fields that
 *                         describe this course itself: broad categories such as
 *                         field = "Computing" would tag every AI or Data Science
 *                         course as Computer Science.
 *   textFields            fields matched as plain text (case-insensitive substring),
 *                         i.e. the search that existed before tags
 */
function searchablePlugin(schema, options) {
  schema.add({
    customSearchTags: {
      type: [String],
      default: [],
      validate: {
        validator: (tags) =>
          tags.length <= MAX_CUSTOM_TAGS &&
          tags.every((tag) => String(tag).trim().length <= MAX_TAG_LENGTH),
        message: `At most ${MAX_CUSTOM_TAGS} search tags of up to ${MAX_TAG_LENGTH} characters are allowed`,
      },
    },

    searchTags: {
      type: [String],
      default: [],
    },

    searchName: {
      type: String,
      select: false,
    },

    searchSpecialization: {
      type: String,
      select: false,
    },
  });

  schema.index({ searchTags: 1 });

  // create(), save() and insertMany() all validate first
  schema.pre("validate", async function () {
    const dictionary = await getDictionary();
    this.set(computeSearchFields(dictionary, this, options));
  });

  // PATCH endpoints use findOneAndUpdate, which skips document middleware
  schema.post("findOneAndUpdate", async function (doc) {
    if (!doc) return;

    const dictionary = await getDictionary();
    const fields = computeSearchFields(dictionary, doc, options);

    await this.model.updateOne({ _id: doc._id }, { $set: fields });
    doc.set({ customSearchTags: fields.customSearchTags, searchTags: fields.searchTags });
  });

  schema.static("searchOptions", () => options);
}

/**
 * Recomputes the search fields of every document of a searchable model.
 * Writes only documents whose fields changed, in batches; safe to repeat.
 */
async function retagModel(Model, { dryRun = false } = {}) {
  const options = Model.searchOptions();
  const dictionary = await getDictionary({ fresh: true });

  const projection = Object.fromEntries(
    [
      ...options.tagFields,
      options.nameField,
      options.specializationField,
      "customSearchTags",
      "searchTags",
      "searchName",
      "searchSpecialization",
    ]
      .filter(Boolean)
      .map((field) => [field, 1]),
  );

  let scanned = 0;
  let updated = 0;
  let ops = [];

  const flush = async () => {
    if (ops.length && !dryRun) await Model.bulkWrite(ops, { ordered: false });
    updated += ops.length;
    ops = [];
  };

  for await (const doc of Model.find({}, projection).lean().cursor()) {
    scanned++;
    const fields = computeSearchFields(dictionary, doc, options);

    if (!sameFields(doc, fields)) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: fields } } });
      if (ops.length >= RETAG_BATCH) await flush();
    }
  }

  await flush();

  return { model: Model.modelName, scanned, updated };
}

/** Retags every model that uses searchablePlugin. */
async function retagAll(models, options) {
  const results = [];
  for (const Model of models) results.push(await retagModel(Model, options));
  return results;
}

// ======================================================
// QUERY HELPERS
// ======================================================

/** Exact-match filters from the query string (strings only, no operators). */
function pickFilters(query, fields) {
  const filter = {};

  fields.forEach((field) => {
    const value = query[field];
    if (typeof value === "string" && value.trim() && value !== "All") filter[field] = value.trim();
  });

  return filter;
}

/**
 * page/limit from the query string. Without either, the endpoint keeps its
 * original behaviour of returning every record.
 */
function parsePaging(query) {
  if (query.page === undefined && query.limit === undefined) return null;

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE),
  );

  return { page, limit };
}

const MATCH_LABELS = {
  exact: "Exact match",
  specialization: "Specialization match",
  tag: "Tag match",
  name: "Name match",
  related: "Related match",
  broader: "Broader match",
  text: "Text match",
};

const TYPE_BY_RELATION = {
  exact: "tag",
  closely_related: "related",
  broader_related: "broader",
};

/** A string or string-array field as one string, for $regexMatch. */
const textOf = (field) => {
  const path = `$${field}`;

  return {
    $reduce: {
      input: { $cond: [{ $isArray: path }, path, [{ $ifNull: [path, ""] }]] },
      initialValue: "",
      in: { $concat: ["$$value", " ", { $ifNull: [{ $toString: "$$this" }, ""] }] },
    },
  };
};

/**
 * Score components, highest first. The first one that applies decides both
 * the relevance score and the "match type" shown in the UI.
 */
function scoreComponents(expansion, options) {
  const { core, normalized, tiers, exactPhrases, concepts } = expansion;
  const fuzzy = concepts.some((concept) => concept.via === "fuzzy") ? 0.85 : 1;

  const name = { $ifNull: [`$searchName`, ""] };
  const specialization = { $ifNull: [`$searchSpecialization`, ""] };
  const tags = { $ifNull: ["$searchTags", []] };
  const terms = [...new Set([core, normalized])];
  const word = `(^| )${escapeRegex(core)}( |$)`;

  const components = [
    ...(core
      ? [
          { score: 100, type: "exact", case: { $in: [name, terms] } },
          { score: 90, type: "specialization", case: { $in: [specialization, terms] } },
          { score: 75, type: "name", case: { $regexMatch: { input: name, regex: word } } },
          { score: 72, type: "specialization", case: { $regexMatch: { input: specialization, regex: word } } },
        ]
      : []),
    {
      score: 20,
      type: "text",
      case: {
        $or: options.textFields.map((field) => ({
          $regexMatch: {
            input: textOf(field),
            regex: escapeRegex(expansion.query),
            options: "i",
          },
        })),
      },
    },
  ];

  if (exactPhrases.length) {
    components.push(
      { score: Math.round(88 * fuzzy), type: "exact", case: { $in: [name, exactPhrases] } },
      { score: Math.round(85 * fuzzy), type: "specialization", case: { $in: [specialization, exactPhrases] } },
    );
  }

  // One component per (score, relation) bucket of expanded tags
  const buckets = new Map();
  tiers.forEach(({ score, relation }, key) => {
    const id = `${score}|${relation}`;
    if (!buckets.has(id)) buckets.set(id, { score, relation, keys: [] });
    buckets.get(id).keys.push(key);
  });

  buckets.forEach(({ score, relation, keys }) => {
    components.push({
      score,
      type: TYPE_BY_RELATION[relation],
      case: { $gt: [{ $size: { $setIntersection: [tags, keys] } }, 0] },
    });
  });

  return components.sort((a, b) => b.score - a.score);
}

/** Internal search fields and computed sort fields are not returned. */
const hiddenFields = (addFields, exclude = []) => ({
  searchName: 0,
  searchSpecialization: 0,
  ...Object.fromEntries(Object.keys(addFields ?? {}).map((field) => [field, 0])),
  ...Object.fromEntries(exclude.map((field) => [field, 0])),
});

function tagLabel(dictionary, key, customTags = []) {
  if (dictionary.concepts.has(key)) return dictionary.concepts.get(key).name;
  return customTags.find((tag) => normalizeTerm(tag) === key) ?? key;
}

function logSearch(scope, expansion, total) {
  SearchLog.updateOne(
    { scope, key: expansion.normalized },
    {
      $inc: {
        count: 1,
        zeroResultCount: total === 0 ? 1 : 0,
        expandedCount: expansion.concepts.length ? 1 : 0,
      },
      $set: { query: expansion.query, lastResultCount: total, lastSearchedAt: new Date() },
    },
    { upsert: true },
  ).catch((error) => console.error("Search log failed:", error.message));
}

/**
 * Ranked search over one searchable model.
 *
 *   q        free-text query (optional)
 *   filter   exact-match filters (pickFilters), combined with the search
 *   paging   { page, limit } or null for "all records"
 *   populate passed to Model.populate for the returned page
 *   sort     optional sort spec instead of relevance / newest first; may use
 *            fields computed by `addFields` (e.g. a lower-cased name)
 *   addFields optional computed fields for `sort`, removed from the output
 *   exclude  fields left out of the returned documents (large internal data)
 */
async function searchCollection(
  Model,
  { q, filter = {}, paging = null, populate = [], sort = null, addFields = null, exclude = [] },
) {
  const options = Model.searchOptions();
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const page = paging?.page ?? 1;
  const limit = paging?.limit;

  // ---------- No query: plain listing, newest first (original behaviour) ----------

  if (!query && (sort || addFields)) {
    const [result] = await Model.aggregate([
      { $match: filter },
      ...(addFields ? [{ $addFields: addFields }] : []),
      { $sort: { ...(sort ?? {}), createdAt: -1, _id: -1 } },
      {
        $facet: {
          data: [
            ...(limit ? [{ $skip: (page - 1) * limit }, { $limit: limit }] : []),
            { $project: hiddenFields(addFields, exclude) },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const data = populate.length ? await Model.populate(result.data, populate) : result.data;
    const total = result.total[0]?.count ?? 0;

    return { data, total, page, limit: limit ?? data.length, search: null };
  }

  if (!query) {
    let find = Model.find(filter).sort({ createdAt: -1, _id: -1 });
    if (exclude.length) find = find.select(exclude.map((field) => `-${field}`).join(" "));
    if (limit) find = find.skip((page - 1) * limit).limit(limit);
    populate.forEach((path) => {
      find = find.populate(path);
    });

    const [data, total] = await Promise.all([
      find,
      limit ? Model.countDocuments(filter) : null,
    ]);

    return { data, total: total ?? data.length, page, limit: limit ?? data.length, search: null };
  }

  // ---------- Search ----------

  const dictionary = await getDictionary();
  // Punctuation-only queries ("(.*") have no terms: plain text search only
  const expansion = expandQuery(dictionary, query) ?? {
    query,
    normalized: "",
    core: "",
    concepts: [],
    tiers: new Map(),
    exactPhrases: [],
    expandedTerms: [],
  };
  const allKeys = [...expansion.tiers.keys()];
  const textRegex = escapeRegex(query);

  // $and keeps a filter's own $or (e.g. "city of programme OR of university") intact
  const match = {
    $and: [
      filter,
      {
        $or: [
          ...options.textFields.map((field) => ({ [field]: { $regex: textRegex, $options: "i" } })),
          { searchTags: { $in: allKeys } },
        ],
      },
    ],
  };

  const components = scoreComponents(expansion, options);

  const [result] = await Model.aggregate([
    { $match: match },
    {
      $addFields: {
        _matchedTags: { $setIntersection: [{ $ifNull: ["$searchTags", []] }, allKeys] },
      },
    },
    {
      $addFields: {
        _score: {
          $add: [
            {
              $switch: {
                branches: components.map((item) => ({ case: item.case, then: item.score })),
                default: 0,
              },
            },
            // Tie-break: more matching tags first
            { $multiply: [{ $size: "$_matchedTags" }, 0.1] },
          ],
        },
        _matchType: {
          $switch: {
            branches: components.map((item) => ({ case: item.case, then: item.type })),
            default: "text",
          },
        },
      },
    },
    ...(addFields ? [{ $addFields: addFields }] : []),
    { $sort: { ...(sort ?? {}), _score: -1, createdAt: -1, _id: -1 } },
    {
      $facet: {
        data: [
          ...(limit ? [{ $skip: (page - 1) * limit }, { $limit: limit }] : []),
          { $project: hiddenFields(addFields, exclude) },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const total = result.total[0]?.count ?? 0;
  const data = populate.length ? await Model.populate(result.data, populate) : result.data;

  for (const item of data) {
    const matchedTags = item._matchedTags
      .map((key) => ({
        key,
        name: tagLabel(dictionary, key, item.customSearchTags),
        relation: expansion.tiers.get(key).relation,
        score: expansion.tiers.get(key).score,
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...tag }) => tag);

    item.searchMatch = {
      type: item._matchType,
      label: MATCH_LABELS[item._matchType],
      score: Math.round(item._score),
      matchedTags,
    };

    delete item._matchedTags;
    delete item._matchType;
    delete item._score;
  }

  // ---------- Zero results: suggest known terms that do have courses ----------

  let suggestions = [];

  if (total === 0 && expansion.core) {
    const keys = suggestionKeys(dictionary, expansion);

    if (keys.length) {
      const counts = await Model.aggregate([
        { $match: { $and: [filter, { searchTags: { $in: keys } }] } },
        { $unwind: "$searchTags" },
        { $match: { searchTags: { $in: keys } } },
        { $group: { _id: "$searchTags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]);

      suggestions = counts.map(({ _id, count }) => ({ term: tagLabel(dictionary, _id), count }));
    }
  }

  if (page === 1 && expansion.normalized) logSearch(options.scope, expansion, total);

  const fuzzy = expansion.concepts.find((concept) => concept.via === "fuzzy");

  return {
    data,
    total,
    page,
    limit: limit ?? data.length,
    search: {
      query: expansion.query,
      normalized: expansion.normalized,
      concepts: expansion.concepts.map(({ name, via }) => ({ name, via })),
      correctedTo: fuzzy?.name,
      expandedTerms: expansion.expandedTerms,
      relatedTermCount: expansion.expandedTerms.length,
      suggestions,
    },
  };
}

module.exports = {
  searchablePlugin,
  computeSearchFields,
  cleanCustomTags,
  retagModel,
  retagAll,
  pickFilters,
  parsePaging,
  searchCollection,
};
