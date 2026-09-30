const express = require("express");

const {
  getUniversities,
  getUniversityById,
  createUniversity,
  updateUniversity,
  deleteUniversity,
} = require("../controllers/universityController");

const {
  readUpload,
  downloadTemplate,
  previewImport,
  confirmImport,
} = require("../controllers/universityImportController");

const router = express.Router();

// Excel import (registered before "/:id" so "import" is not read as an id)
router.get("/import/template", downloadTemplate);
router.post("/import/preview", readUpload, previewImport);
router.post("/import/confirm", readUpload, confirmImport);

router.get("/", getUniversities);
router.get("/:id", getUniversityById);
router.post("/", createUniversity);
router.patch("/:id", updateUniversity);
router.delete("/:id", deleteUniversity);

module.exports = router;