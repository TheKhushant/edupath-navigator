const mongoose = require("mongoose");

const followUpSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
    },

    studentExternalId: {
      type: String,
      trim: true,
    },

    studentName: {
      type: String,
      trim: true,
    },

    counsellor: {
      type: String,
      trim: true,
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

    type: {
      type: String,
      trim: true,
    },

    date: {
      type: String,
      trim: true,
    },

    time: {
      type: String,
      trim: true,
    },

    dueDate: {
      type: String,
      trim: true,
    },

    priority: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },

    completedDate: {
      type: String,
      trim: true,
    },

    assignedTo: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

followUpSchema.index({ studentExternalId: 1 });
followUpSchema.index({ status: 1 });
followUpSchema.index({ priority: 1 });
followUpSchema.index({ dueDate: 1 });

module.exports = mongoose.model("FollowUp", followUpSchema);