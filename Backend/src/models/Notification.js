const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      trim: true,
    },

    priority: {
      type: String,
      trim: true,
    },

    relatedEntity: {
      type: String,
      trim: true,
    },

    relatedEntityId: {
      type: String,
      trim: true,
    },

    read: {
      type: Boolean,
      default: false,
    },

    createdAtSource: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ read: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);