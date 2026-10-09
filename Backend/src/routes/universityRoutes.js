const express = require("express");
const University = require("../models/University");
const { bulkDeleteHandler } = require("../utils/bulkDelete");

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
  importProgress,
  listCustomFields,
} = require("../controllers/universityImportController");

const router = express.Router();

// Excel import (registered before "/:id" so "import" is not read as an id)
router.get("/import/template", downloadTemplate);
router.post("/import/preview", readUpload, previewImport);
router.post("/import/confirm", readUpload, confirmImport);
router.get("/import/progress/:progressId", importProgress);
router.get("/import/custom-fields", listCustomFields);

router.get("/", getUniversities);
router.get("/:id", getUniversityById);
router.post("/", createUniversity);
router.post("/bulk-delete", bulkDeleteHandler(University, "universities"));
router.patch("/:id", updateUniversity);
router.delete("/:id", deleteUniversity);

module.exports = router;