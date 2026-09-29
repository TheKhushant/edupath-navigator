const express = require("express");

const {
  getCountries,
  getCountryById,
  createCountry,
  updateCountry,
  deleteCountry,
} = require("../controllers/countryController");

const router = express.Router();

router.get("/", getCountries);
router.get("/:id", getCountryById);
router.post("/", createCountry);
router.patch("/:id", updateCountry);
router.delete("/:id", deleteCountry);

module.exports = router;