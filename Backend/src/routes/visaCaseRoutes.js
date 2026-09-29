const express = require("express");

const {
  getVisaCases,
  getVisaCaseById,
  createVisaCase,
  updateVisaCase,
  deleteVisaCase,
} = require("../controllers/visaCaseController");

const router = express.Router();

router.get("/", getVisaCases);
router.get("/:id", getVisaCaseById);
router.post("/", createVisaCase);
router.patch("/:id", updateVisaCase);
router.delete("/:id", deleteVisaCase);

module.exports = router;