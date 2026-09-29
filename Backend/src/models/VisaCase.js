const mongoose = require("mongoose");

const visaCaseSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
    },

    studentExternalId: {
      type: String,
      trim: true,
    },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
    },

    applicationExternalId: {
      type: String,
      trim: true,
    },

    country: {
      type: String,
      trim: true,
    },

    visaType: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },

    applicationDate: {
      type: String,
      trim: true,
    },

    biometricDate: {
      type: String,
      trim: true,
    },

    interviewDate: {
      type: String,
      trim: true,
    },

    decisionDate: {
      type: String,
      trim: true,
    },

    expiryDate: {
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

visaCaseSchema.index({ studentExternalId: 1 });
visaCaseSchema.index({ status: 1 });
visaCaseSchema.index({ country: 1 });

module.exports = mongoose.model("VisaCase", visaCaseSchema);