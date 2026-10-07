const express = require("express");
const router = express.Router();

const {
  searchCourses,
  searchUniversities,
  getFacets,
  getUniversityDetails,
  getCourseDetails,
  getItems,
} = require("../controllers/explorerController");

// University & Course Explorer (read-only)
router.get("/facets", getFacets);
router.get("/items", getItems);
router.get("/courses", searchCourses);
router.get("/courses/:id", getCourseDetails);
router.get("/universities", searchUniversities);
router.get("/universities/:id", getUniversityDetails);

module.exports = router;
