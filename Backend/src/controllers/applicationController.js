const Application = require("../models/Application");
const { idFilter } = require("../utils/idFilter");

// GET all applications
const getApplications = async (req, res) => {
  try {
    const applications = await Application.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: applications.length,
      data: applications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      error: error.message,
    });
  }
};

// GET single application
const getApplicationById = async (req, res) => {
  try {
    const application = await Application.findOne(idFilter(req.params.id));

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch application",
      error: error.message,
    });
  }
};

// CREATE application
const createApplication = async (req, res) => {
  try {
    const application = await Application.create(req.body);

    res.status(201).json({
      success: true,
      message: "Application created successfully",
      data: application,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create application",
      error: error.message,
    });
  }
};

// UPDATE application
const updateApplication = async (req, res) => {
  try {
    const application = await Application.findOneAndUpdate(
      idFilter(req.params.id),
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Application updated successfully",
      data: application,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update application",
      error: error.message,
    });
  }
};

// DELETE application
const deleteApplication = async (req, res) => {
  try {
    const application = await Application.findOneAndDelete(idFilter(req.params.id));

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Application deleted successfully",
      data: application,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete application",
      error: error.message,
    });
  }
};

module.exports = {
  getApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  deleteApplication,
};