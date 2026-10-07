const express = require("express");
const router = express.Router();

const {
  getSearchTags,
  expandSearchTerm,
  getSearchAnalytics,
  getSearchTagById,
  createSearchTag,
  updateSearchTag,
  deleteSearchTag,
} = require("../controllers/searchTagController");

router.get("/expand", expandSearchTerm);
router.get("/analytics", getSearchAnalytics);

router.get("/", getSearchTags);
router.get("/:id", getSearchTagById);
router.post("/", createSearchTag);
router.patch("/:id", updateSearchTag);
router.delete("/:id", deleteSearchTag);

module.exports = router;
