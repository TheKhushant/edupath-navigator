const UniversityCourse = require("../models/UniversityCourse");
const University = require("../models/University");
const { idFilter } = require("../utils/idFilter");
const { pickFilters, parsePaging, searchCollection } = require("../services/courseSearch");

// Optional exact-match query filters, e.g. ?source=hochschulkompass&city=Berlin
const FILTER_FIELDS = [
  "source",
  "degree",
  "studyType",
  "studyMode",
  "admissionMode",
  "city",
  "state",
  "language",
  "universityExternalId",
  "status",
];

const plain = (doc) => (typeof doc?.toObject === "function" ? doc.toObject() : doc);

/**
 * Courses linked only by the university's readable id (universityExternalId,
 * no universityId reference) get the university's name, so lists show the
 * university instead of "Not linked".
 */
async function withUniversityNames(courses) {
  const linkedByIdOnly = (course) =>
    !course.universityName && !course.universityId?.name && course.universityExternalId;

  const ids = [...new Set(courses.filter(linkedByIdOnly).map((course) => course.universityExternalId))];
  if (!ids.length) return courses;

  const universities = await University.find({ id: { $in: ids } }, { id: 1, name: 1 }).lean();
  const nameById = new Map(universities.map((university) => [university.id, university.name]));

  return courses.map((course) =>
    linkedByIdOnly(course) && nameById.has(course.universityExternalId)
      ? { ...plain(course), universityName: nameById.get(course.universityExternalId) }
      : course,
  );
}

// GET all university courses
// ?q=      ranked search over programme name, specialization and university
//          name, expanded with related search tags (see services/courseSearch.js)
// ?page=&limit= pagination; without them every programme is returned
const getUniversityCourses = async (req, res) => {
  try {
    const { data, total, page, limit, search } = await searchCollection(UniversityCourse, {
      q: req.query.q,
      filter: pickFilters(req.query, FILTER_FIELDS),
      paging: parsePaging(req.query),
      populate: ["universityId", "courseId"],
    });

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      page,
      limit,
      data: await withUniversityNames(data),
      search,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch university courses",
      error: error.message,
    });
  }
};

// GET single university course
const getUniversityCourseById = async (req, res) => {
  try {
    const course = await UniversityCourse.findOne(idFilter(req.params.id))
      .populate("universityId")
      .populate("courseId");

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "University course not found",
      });
    }

    res.status(200).json({
      success: true,
      data: (await withUniversityNames([course]))[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch university course",
      error: error.message,
    });
  }
};

/**
 * Forms send the university's readable id (universityExternalId, e.g.
 * "DEU-001"); store the ObjectId reference and name with it so the
 * programme is linked like seeded and imported ones.
 */
async function withUniversityLink(body) {
  if (!body || typeof body.universityExternalId !== "string" || !body.universityExternalId) {
    return body;
  }

  const university = await University.findOne(idFilter(body.universityExternalId), {
    _id: 1,
    id: 1,
    name: 1,
  }).lean();

  if (!university) {
    const error = new Error(`University "${body.universityExternalId}" not found`);
    error.status = 400;
    throw error;
  }

  return {
    ...body,
    universityId: university._id,
    universityExternalId: university.id || String(university._id),
    universityName: university.name,
  };
}

// customFields are written only by the Excel import, which validates them
// against their CustomFieldDefinition; the plain CRUD body cannot set them.
const withoutCustomFields = (body = {}) =>
  Object.fromEntries(
    Object.entries(body ?? {})
      .filter(([key]) => key !== "customFields" && !key.startsWith("customFields."))
      // Also inside update operators such as $set / $unset
      .map(([key, value]) =>
        key.startsWith("$") && value && typeof value === "object" ? [key, withoutCustomFields(value)] : [key, value],
      ),
  );

// CREATE university course
const createUniversityCourse = async (req, res) => {
  try {
    const course = await UniversityCourse.create(await withUniversityLink(withoutCustomFields(req.body)));

    res.status(201).json({
      success: true,
      message: "University course created successfully",
      data: course,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create university course",
      error: error.message,
    });
  }
};

// UPDATE university course
const updateUniversityCourse = async (req, res) => {
  try {
    const course = await UniversityCourse.findOneAndUpdate(
      idFilter(req.params.id),
      await withUniversityLink(withoutCustomFields(req.body)),
      {
        new: true,
        runValidators: true,
      }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "University course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "University course updated successfully",
      data: course,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update university course",
      error: error.message,
    });
  }
};

// DELETE university course
const deleteUniversityCourse = async (req, res) => {
  try {
    const course = await UniversityCourse.findOneAndDelete(idFilter(req.params.id));

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "University course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "University course deleted successfully",
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete university course",
      error: error.message,
    });
  }
};

module.exports = {
  getUniversityCourses,
  getUniversityCourseById,
  createUniversityCourse,
  updateUniversityCourse,
  deleteUniversityCourse,
};