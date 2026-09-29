const FollowUp = require("../models/FollowUp");

// GET all follow-ups
const getFollowUps = async (req, res) => {
  try {
    const followUps = await FollowUp.find().sort({ dueDate: 1 });

    res.status(200).json({
      success: true,
      count: followUps.length,
      data: followUps,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch follow-ups",
      error: error.message,
    });
  }
};

// GET single follow-up
const getFollowUpById = async (req, res) => {
  try {
    const followUp = await FollowUp.findOne({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: "Follow-up not found",
      });
    }

    res.status(200).json({
      success: true,
      data: followUp,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch follow-up",
      error: error.message,
    });
  }
};

// CREATE follow-up
const createFollowUp = async (req, res) => {
  try {
    const followUp = await FollowUp.create(req.body);

    res.status(201).json({
      success: true,
      message: "Follow-up created successfully",
      data: followUp,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create follow-up",
      error: error.message,
    });
  }
};

// UPDATE follow-up
const updateFollowUp = async (req, res) => {
  try {
    const followUp = await FollowUp.findOneAndUpdate(
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

    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: "Follow-up not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Follow-up updated successfully",
      data: followUp,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update follow-up",
      error: error.message,
    });
  }
};

// DELETE follow-up
const deleteFollowUp = async (req, res) => {
  try {
    const followUp = await FollowUp.findOneAndDelete({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: "Follow-up not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Follow-up deleted successfully",
      data: followUp,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete follow-up",
      error: error.message,
    });
  }
};

module.exports = {
  getFollowUps,
  getFollowUpById,
  createFollowUp,
  updateFollowUp,
  deleteFollowUp,
};