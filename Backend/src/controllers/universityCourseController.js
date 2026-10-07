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
      data,
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
      data: course,
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

// CREATE university course
const createUniversityCourse = async (req, res) => {
  try {
    const course = await UniversityCourse.create(await withUniversityLink(req.body));

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
      await withUniversityLink(req.body),
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