const express = require("express");
const UniversityCourse = require("../models/UniversityCourse");
const { bulkDeleteHandler } = require("../utils/bulkDelete");

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
router.post("/bulk-delete", bulkDeleteHandler(UniversityCourse, "university courses"));
router.patch("/:id", updateUniversityCourse);
router.delete("/:id", deleteUniversityCourse);

module.exports = router;