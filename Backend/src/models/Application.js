const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
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

    universityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "University",
    },

    universityExternalId: {
      type: String,
      trim: true,
    },

    universityName: {
      type: String,
      trim: true,
    },

    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },

    courseExternalId: {
      type: String,
      trim: true,
    },

    courseName: {
      type: String,
      trim: true,
    },

    intake: {
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

    deadline: {
      type: String,
      trim: true,
    },

    submissionDate: {
      type: String,
      trim: true,
    },

    submittedDate: {
      type: String,
      trim: true,
    },

    offerStatus: {
      type: String,
      trim: true,
    },

    offerDate: {
      type: String,
      trim: true,
    },

    decisionDate: {
      type: String,
      trim: true,
    },

    applicationNumber: {
      type: String,
      trim: true,
    },

    counsellor: {
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

applicationSchema.index({ studentExternalId: 1 });
applicationSchema.index({ universityExternalId: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ offerStatus: 1 });

module.exports = mongoose.model("Application", applicationSchema);