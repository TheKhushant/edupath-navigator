const UniversityCourse = require("../models/UniversityCourse");
const { idFilter } = require("../utils/idFilter");

// GET all university courses
const getUniversityCourses = async (req, res) => {
  try {
    const courses = await UniversityCourse.find()
      .populate("universityId")
      .populate("courseId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
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

// CREATE university course
const createUniversityCourse = async (req, res) => {
  try {
    const course = await UniversityCourse.create(req.body);

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
      req.body,
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