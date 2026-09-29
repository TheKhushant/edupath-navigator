const mongoose = require("mongoose");

const universityCourseSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
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

    degreeLevel: {
      type: String,
      trim: true,
    },

    duration: {
      type: String,
      trim: true,
    },

    tuitionFee: {
      type: Number,
    },

    applicationFee: {
      type: Number,
    },

    intake: [
      {
        type: String,
        trim: true,
      },
    ],

    applicationDeadline: {
      type: String,
      trim: true,
    },

    minimumIELTS: {
      type: Number,
    },

    minimumCGPA: {
      type: Number,
    },

    requirements: [
      {
        type: String,
        trim: true,
      },
    ],

    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Very Hard"],
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

universityCourseSchema.index({ universityExternalId: 1 });
universityCourseSchema.index({ courseExternalId: 1 });
universityCourseSchema.index({ courseName: 1 });

module.exports = mongoose.model(
  "UniversityCourse",
  universityCourseSchema
);