const express = require("express");
const Course = require("../models/Course");
const { bulkDeleteHandler } = require("../utils/bulkDelete");

const {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
} = require("../controllers/courseController");

const router = express.Router();

router.get("/", getCourses);
router.get("/:id", getCourseById);
router.post("/", createCourse);
router.post("/bulk-delete", bulkDeleteHandler(Course, "courses"));
router.patch("/:id", updateCourse);
router.delete("/:id", deleteCourse);

module.exports = router;