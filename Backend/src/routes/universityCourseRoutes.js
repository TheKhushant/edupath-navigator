const express = require("express");

const {
  getUniversityCourses,
  getUniversityCourseById,
  createUniversityCourse,
  updateUniversityCourse,
  deleteUniversityCourse,
} = require("../controllers/universityCourseController");

const router = express.Router();

router.get("/", getUniversityCourses);
router.get("/:id", getUniversityCourseById);
router.post("/", createUniversityCourse);
router.patch("/:id", updateUniversityCourse);
router.delete("/:id", deleteUniversityCourse);

module.exports = router;