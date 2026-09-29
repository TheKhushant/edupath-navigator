const express = require("express");

const {
  getNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", getNotifications);
router.get("/:id", getNotificationById);
router.post("/", createNotification);
router.patch("/:id", updateNotification);
router.delete("/:id", deleteNotification);

module.exports = router;