const Notification = require("../models/Notification");

// GET all notifications
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

// GET single notification
const getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch notification",
      error: error.message,
    });
  }
};

// CREATE notification
const createNotification = async (req, res) => {
  try {
    const notification = await Notification.create(req.body);

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      data: notification,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create notification",
      error: error.message,
    });
  }
};

// UPDATE notification
const updateNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
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

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification updated successfully",
      data: notification,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update notification",
      error: error.message,
    });
  }
};

// DELETE notification
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
      data: notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};

module.exports = {
  getNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
};