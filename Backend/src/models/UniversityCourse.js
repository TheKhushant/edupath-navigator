const mongoose = require("mongoose");

const universityCourseSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
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
      required: true,
      trim: true,
    },

    canonicalCourse: {
      type: String,
      trim: true,
    },

    aliases: {
      type: [String],
      default: [],
    },

    degree: {
      type: String,
      trim: true,
    },

    degreeLevel: {
      type: String,
      trim: true,
    },

    specialization: {
      type: String,
      trim: true,
    },

    duration: {
      type: String,
      trim: true,
    },

    language: {
      type: String,
      trim: true,
    },

    tuitionMin: {
      type: Number,
    },

    tuitionMax: {
      type: Number,
    },

    tuitionFee: {
      type: String,
      trim: true,
    },

    tuitionCurrency: {
      type: String,
      trim: true,
    },

    tuitionPeriod: {
      type: String,
      trim: true,
    },

    applicationFee: {
      type: String,
      trim: true,
    },

    intake: {
      type: String,
      trim: true,
    },

    applicationStartDate: {
      type: String,
      trim: true,
    },

    applicationDeadline: {
      type: String,
      trim: true,
    },

    requiredDegree: {
      type: String,
      trim: true,
    },

    minimumGpa: {
      type: String,
      trim: true,
    },

    ielts: {
      type: String,
      trim: true,
    },

    toefl: {
      type: String,
      trim: true,
    },

    gre: {
      type: String,
      trim: true,
    },

    eligibility: {
      type: String,
      trim: true,
    },

    requirements: {
      type: [String],
      default: [],
    },

    entranceExam: {
      type: String,
      trim: true,
    },

    interview: {
      type: String,
      trim: true,
    },

    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Very Hard"],
    },

    lastVerified: {
      type: String,
      trim: true,
    },

    sourceUrl: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

universityCourseSchema.index({ courseName: 1 });
universityCourseSchema.index({ universityExternalId: 1 });
universityCourseSchema.index({ courseExternalId: 1 });
universityCourseSchema.index({ difficulty: 1 });

module.exports = mongoose.model(
  "UniversityCourse",
  universityCourseSchema
);