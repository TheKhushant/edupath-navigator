const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    ranking: {
      type: Number,
    },

    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Very Hard"],
      trim: true,
    },

    tuitionFeeMin: {
      type: Number,
    },

    tuitionFeeMax: {
      type: Number,
    },

    livingCostMin: {
      type: Number,
    },

    livingCostMax: {
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

    website: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    requirements: [
      {
        type: String,
        trim: true,
      },
    ],

    englishRequirement: {
      type: Number,
    },

    popularCourses: [
      {
        type: String,
        trim: true,
      },
    ],

    status: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

universitySchema.index({ name: 1 });
universitySchema.index({ country: 1 });
universitySchema.index({ difficulty: 1 });

module.exports = mongoose.model("University", universitySchema);