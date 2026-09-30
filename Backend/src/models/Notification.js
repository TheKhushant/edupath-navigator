const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      trim: true,
    },

    time: {
      type: String,
      trim: true,
    },

    tone: {
      type: String,
      trim: true,
    },

    read: {
      type: Boolean,
      default: false,
    },

    message: {
      type: String,
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
notificationSchema.index({ category: 1 });

module.exports = mongoose.model("Notification", notificationSchema);