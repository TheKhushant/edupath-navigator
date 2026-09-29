const express = require("express");

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
router.patch("/:id", updateCourse);
router.delete("/:id", deleteCourse);

module.exports = router;