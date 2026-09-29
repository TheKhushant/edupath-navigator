const express = require("express");

const {
  getUniversities,
  getUniversityById,
  createUniversity,
  updateUniversity,
  deleteUniversity,
} = require("../controllers/universityController");

const router = express.Router();

router.get("/", getUniversities);
router.get("/:id", getUniversityById);
router.post("/", createUniversity);
router.patch("/:id", updateUniversity);
router.delete("/:id", deleteUniversity);

module.exports = router;