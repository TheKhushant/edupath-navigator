const VisaCase = require("../models/VisaCase");

// GET all visa cases
const getVisaCases = async (req, res) => {
  try {
    const visaCases = await VisaCase.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: visaCases.length,
      data: visaCases,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch visa cases",
      error: error.message,
    });
  }
};

// GET single visa case
const getVisaCaseById = async (req, res) => {
  try {
    const visaCase = await VisaCase.findOne({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!visaCase) {
      return res.status(404).json({
        success: false,
        message: "Visa case not found",
      });
    }

    res.status(200).json({
      success: true,
      data: visaCase,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch visa case",
      error: error.message,
    });
  }
};

// CREATE visa case
const createVisaCase = async (req, res) => {
  try {
    const visaCase = await VisaCase.create(req.body);

    res.status(201).json({
      success: true,
      message: "Visa case created successfully",
      data: visaCase,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create visa case",
      error: error.message,
    });
  }
};

// UPDATE visa case
const updateVisaCase = async (req, res) => {
  try {
    const visaCase = await VisaCase.findOneAndUpdate(
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

    if (!visaCase) {
      return res.status(404).json({
        success: false,
        message: "Visa case not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Visa case updated successfully",
      data: visaCase,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update visa case",
      error: error.message,
    });
  }
};

// DELETE visa case
const deleteVisaCase = async (req, res) => {
  try {
    const visaCase = await VisaCase.findOneAndDelete({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!visaCase) {
      return res.status(404).json({
        success: false,
        message: "Visa case not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Visa case deleted successfully",
      data: visaCase,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete visa case",
      error: error.message,
    });
  }
};

module.exports = {
  getVisaCases,
  getVisaCaseById,
  createVisaCase,
  updateVisaCase,
  deleteVisaCase,
};