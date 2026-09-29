const Country = require("../models/Country");

// GET all countries
const getCountries = async (req, res) => {
  try {
    const countries = await Country.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: countries.length,
      data: countries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch countries",
      error: error.message,
    });
  }
};

// GET single country
const getCountryById = async (req, res) => {
  try {
    const country = await Country.findOne({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Country not found",
      });
    }

    res.status(200).json({
      success: true,
      data: country,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch country",
      error: error.message,
    });
  }
};

// CREATE country
const createCountry = async (req, res) => {
  try {
    const country = await Country.create(req.body);

    res.status(201).json({
      success: true,
      message: "Country created successfully",
      data: country,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create country",
      error: error.message,
    });
  }
};

// UPDATE country
const updateCountry = async (req, res) => {
  try {
    const country = await Country.findOneAndUpdate(
      {
        $or: [
          { _id: req.params.id },
          { id: req.params.id },
        ],
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Country not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Country updated successfully",
      data: country,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update country",
      error: error.message,
    });
  }
};

// DELETE country
const deleteCountry = async (req, res) => {
  try {
    const country = await Country.findOneAndDelete({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Country not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Country deleted successfully",
      data: country,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete country",
      error: error.message,
    });
  }
};

module.exports = {
  getCountries,
  getCountryById,
  createCountry,
  updateCountry,
  deleteCountry,
};