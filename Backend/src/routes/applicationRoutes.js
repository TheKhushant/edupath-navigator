const express = require("express");

const {
  getApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  deleteApplication,
} = require("../controllers/applicationController");

const router = express.Router();

router.get("/", getApplications);
router.get("/:id", getApplicationById);
router.post("/", createApplication);
router.patch("/:id", updateApplication);
router.delete("/:id", deleteApplication);

module.exports = router;