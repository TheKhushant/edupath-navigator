const express = require("express");

const {
  getFollowUps,
  getFollowUpById,
  createFollowUp,
  updateFollowUp,
  deleteFollowUp,
} = require("../controllers/followUpController");

const router = express.Router();

router.get("/", getFollowUps);
router.get("/:id", getFollowUpById);
router.post("/", createFollowUp);
router.patch("/:id", updateFollowUp);
router.delete("/:id", deleteFollowUp);

module.exports = router;