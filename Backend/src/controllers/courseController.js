const Course = require("../models/Course");
const { idFilter } = require("../utils/idFilter");
const { pickFilters, parsePaging, searchCollection } = require("../services/courseSearch");

// Optional exact-match query filters, e.g. ?status=Active&country=Germany
const FILTER_FIELDS = ["status", "country", "degree", "level", "field", "language"];

// GET all courses
// ?q=      ranked search with related search tags (see services/courseSearch.js)
// ?page=&limit= pagination; without them every course is returned (original behaviour)
const getCourses = async (req, res) => {
  try {
    const { data, total, page, limit, search } = await searchCollection(Course, {
      q: req.query.q,
      filter: pickFilters(req.query, FILTER_FIELDS),
      paging: parsePaging(req.query),
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
      message: "Failed to fetch courses",
      error: error.message,
    });
  }
};

// GET single course
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findOne(idFilter(req.params.id));

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch course",
      error: error.message,
    });
  }
};

// CREATE course
const createCourse = async (req, res) => {
  try {
    const course = await Course.create(req.body);

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: course,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create course",
      error: error.message,
    });
  }
};

// UPDATE course
const updateCourse = async (req, res) => {
  try {
    const course = await Course.findOneAndUpdate(
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
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: course,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update course",
      error: error.message,
    });
  }
};

// DELETE course
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findOneAndDelete(idFilter(req.params.id));

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete course",
      error: error.message,
    });
  }
};

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
};