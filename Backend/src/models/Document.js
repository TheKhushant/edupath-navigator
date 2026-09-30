const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
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

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
    },

    applicationExternalId: {
      type: String,
      trim: true,
    },

    name: {
      type: String,
      trim: true,
    },

    type: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },

    fileName: {
      type: String,
      trim: true,
    },

    fileUrl: {
      type: String,
      trim: true,
    },

    uploadedDate: {
      type: String,
      trim: true,
    },

    uploadedAt: {
      type: String,
      trim: true,
    },

    verifiedAt: {
      type: String,
      trim: true,
    },

    verifiedBy: {
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

documentSchema.index({ studentExternalId: 1 });
documentSchema.index({ applicationExternalId: 1 });
documentSchema.index({ status: 1 });

module.exports = mongoose.model("Document", documentSchema);