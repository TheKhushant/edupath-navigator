const mongoose = require("mongoose");
const SearchTag = require("../models/SearchTag");
const SearchLog = require("../models/SearchLog");
const Course = require("../models/Course");
const UniversityCourse = require("../models/UniversityCourse");
const University = require("../models/University");
const { normalizeTerm, compactTerm, escapeRegex } = require("../utils/searchText");
const {
  getDictionary,
  invalidateDictionary,
  expandQuery,
} = require("../services/searchTagDictionary");
const { retagAll } = require("../services/courseSearch");

const { RELATIONS } = SearchTag;
const SEARCHABLE_MODELS = [Course, UniversityCourse, University];

const MAX_NAME = 80;
const MAX_ALIASES = 50;
const MAX_RELATED = 50;

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const sendError = (res, error, fallback) =>
  res.status(error.status ?? (error.name === "ValidationError" ? 400 : 500)).json({
    success: false,
    message: error.status ? error.message : fallback,
    error: error.message,
  });

// The tag lookup the API resolves by: Mongo _id, or the tag's normalized name
const tagFilter = (id) =>
  mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { key: normalizeTerm(id) };

/**
 * Validates and normalizes a create/update body. Only the fields present
 * are returned, so PATCH can update a single field.
 */
async function readBody(body, { partial }) {
  const data = {};

  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || !normalizeTerm(body.name)) {
      throw new RequestError("name is required");
    }
    if (body.name.trim().length > MAX_NAME) {
      throw new RequestError(`name must be at most ${MAX_NAME} characters`);
    }
    data.name = body.name;
  }

  if (body.aliases !== undefined) {
    if (
      !Array.isArray(body.aliases) ||
      body.aliases.length > MAX_ALIASES ||
      body.aliases.some((alias) => typeof alias !== "string" || alias.trim().length > MAX_NAME)
    ) {
      throw new RequestError(
        `aliases must be an array of at most ${MAX_ALIASES} strings of up to ${MAX_NAME} characters`,
      );
    }
    data.aliases = body.aliases;
  }

  if (body.related !== undefined) {
    if (!Array.isArray(body.related) || body.related.length > MAX_RELATED) {
      throw new RequestError(`related must be an array of at most ${MAX_RELATED} items`);
    }

    const related = body.related.map((item) => ({
      tag: String(item?.tag ?? ""),
      relation: item?.relation,
    }));

    for (const item of related) {
      if (!mongoose.Types.ObjectId.isValid(item.tag)) {
        throw new RequestError(`related tag "${item.tag}" is not a valid id`);
      }
      if (!RELATIONS.includes(item.relation)) {
        throw new RequestError(`relation must be one of: ${RELATIONS.join(", ")}`);
      }
    }

    const ids = [...new Set(related.map((item) => item.tag))];
    const found = await SearchTag.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw new RequestError("related contains a tag that does not exist");

    data.related = related;
  }

  if (body.category !== undefined) data.category = String(body.category ?? "").trim();

  if (body.status !== undefined) {
    if (!["active", "inactive"].includes(body.status)) {
      throw new RequestError("status must be active or inactive");
    }
    data.status = body.status;
  }

  return data;
}

/** A term (name or alias) may belong to one concept only. */
async function assertNoConflicts(tag) {
  const terms = [tag.name, ...tag.aliases];
  const keys = [...new Set(terms.flatMap((term) => [normalizeTerm(term), compactTerm(term)]))];

  const conflict = await SearchTag.findOne(
    { _id: { $ne: tag._id }, aliasKeys: { $in: keys } },
    { name: 1, aliasKeys: 1 },
  ).lean();

  if (conflict) {
    const term = terms.find((item) =>
      conflict.aliasKeys.some((key) => key === normalizeTerm(item) || key === compactTerm(item)),
    );

    throw new RequestError(`"${term}" is already used by the search tag "${conflict.name}"`, 409);
  }
}

const lookupFields = (tag) =>
  JSON.stringify([tag.key, [...(tag.aliasKeys ?? [])].sort(), tag.status]);

/** Courses store concept keys, so a changed name/alias/status needs a retag. */
async function afterChange(lookupChanged) {
  invalidateDictionary();
  return lookupChanged ? retagAll(SEARCHABLE_MODELS) : [];
}

const populateRelated = (query) => query.populate("related.tag", "name key status");

// GET /search-tags?q=&status=&page=&limit=
const getSearchTags = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const filter = {};

    if (typeof req.query.status === "string" && req.query.status) filter.status = req.query.status;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q) {
      filter.$or = [
        { name: { $regex: escapeRegex(q), $options: "i" } },
        { aliasKeys: { $regex: `^${escapeRegex(normalizeTerm(q))}` } },
      ];
    }

    const [data, total] = await Promise.all([
      populateRelated(SearchTag.find(filter))
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SearchTag.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, count: data.length, total, page, limit, data });
  } catch (error) {
    sendError(res, error, "Failed to fetch search tags");
  }
};

// GET /search-tags/expand?q=AI  -> what a search for this term would use
const expandSearchTerm = async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) throw new RequestError("q is required");

    const expansion = expandQuery(await getDictionary(), q);

    res.status(200).json({
      success: true,
      data: {
        query: q,
        normalized: expansion?.normalized ?? "",
        concepts: expansion?.concepts.map(({ name, via }) => ({ name, via })) ?? [],
        expandedTerms: expansion?.expandedTerms ?? [],
      },
    });
  } catch (error) {
    sendError(res, error, "Failed to expand search term");
  }
};

// GET /search-tags/analytics?scope=courses&limit=10
const getSearchAnalytics = async (req, res) => {
  try {
    const scope = typeof req.query.scope === "string" ? req.query.scope : "courses";
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const fields = { _id: 0, query: 1, key: 1, count: 1, zeroResultCount: 1, expandedCount: 1, lastResultCount: 1, lastSearchedAt: 1 };

    const [topSearches, zeroResultSearches] = await Promise.all([
      SearchLog.find({ scope }, fields).sort({ count: -1 }).limit(limit).lean(),
      // Only terms that still find nothing; fixed ones drop off the list
      SearchLog.find({ scope, zeroResultCount: { $gt: 0 }, lastResultCount: 0 }, fields)
        .sort({ zeroResultCount: -1 })
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({ success: true, data: { scope, topSearches, zeroResultSearches } });
  } catch (error) {
    sendError(res, error, "Failed to fetch search analytics");
  }
};

// GET /search-tags/:id
const getSearchTagById = async (req, res) => {
  try {
    const tag = await populateRelated(SearchTag.findOne(tagFilter(req.params.id))).lean();
    if (!tag) throw new RequestError("Search tag not found", 404);

    res.status(200).json({ success: true, data: tag });
  } catch (error) {
    sendError(res, error, "Failed to fetch search tag");
  }
};

// POST /search-tags
const createSearchTag = async (req, res) => {
  try {
    const tag = new SearchTag({ ...(await readBody(req.body ?? {}, { partial: false })), source: "manual" });
    await tag.validate();
    await assertNoConflicts(tag);
    await tag.save();

    const retagged = await afterChange(true);
    const data = await populateRelated(SearchTag.findById(tag._id)).lean();

    res.status(201).json({ success: true, message: "Search tag created successfully", data, retagged });
  } catch (error) {
    sendError(res, error, "Failed to create search tag");
  }
};

// PATCH /search-tags/:id
const updateSearchTag = async (req, res) => {
  try {
    const tag = await SearchTag.findOne(tagFilter(req.params.id));
    if (!tag) throw new RequestError("Search tag not found", 404);

    const before = lookupFields(tag);
    tag.set(await readBody(req.body ?? {}, { partial: true }));
    await tag.validate();
    await assertNoConflicts(tag);
    await tag.save();

    const retagged = await afterChange(lookupFields(tag) !== before);
    const data = await populateRelated(SearchTag.findById(tag._id)).lean();

    res.status(200).json({ success: true, message: "Search tag updated successfully", data, retagged });
  } catch (error) {
    sendError(res, error, "Failed to update search tag");
  }
};

// DELETE /search-tags/:id
const deleteSearchTag = async (req, res) => {
  try {
    const tag = await SearchTag.findOneAndDelete(tagFilter(req.params.id));
    if (!tag) throw new RequestError("Search tag not found", 404);

    await SearchTag.updateMany({ "related.tag": tag._id }, { $pull: { related: { tag: tag._id } } });
    const retagged = await afterChange(true);

    res.status(200).json({ success: true, message: "Search tag deleted successfully", data: tag, retagged });
  } catch (error) {
    sendError(res, error, "Failed to delete search tag");
  }
};

module.exports = {
  getSearchTags,
  expandSearchTerm,
  getSearchAnalytics,
  getSearchTagById,
  createSearchTag,
  updateSearchTag,
  deleteSearchTag,
};
