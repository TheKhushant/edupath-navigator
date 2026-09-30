const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
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
      type: String,
      trim: true,
    },

    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Very Hard"],
    },

    website: {
      type: String,
      trim: true,
    },

    portal: {
      type: String,
      trim: true,
    },

    applicationFee: {
      type: String,
      trim: true,
    },

    scholarship: {
      type: String,
      trim: true,
    },

    financialProof: {
      type: String,
      trim: true,
    },

    partTime: {
      type: String,
      trim: true,
    },

    postStudyWork: {
      type: String,
      trim: true,
    },

    documents: {
      type: [String],
      default: [],
    },

    sop: {
      type: String,
      trim: true,
    },

    lor: {
      type: String,
      trim: true,
    },

    aps: {
      type: String,
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

    intake: {
      type: [String],
      default: [],
    },

    applicationDeadline: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    requirements: {
      type: [String],
      default: [],
    },

    englishRequirement: {
      type: String,
      trim: true,
    },

    popularCourses: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      trim: true,
    },

    lastVerified: {
      type: String,
      trim: true,
    },

    sourceUrl: {
      type: String,
      trim: true,
    },

    applicationOpens: {
      type: String,
      trim: true,
    },

    recommendedIndianPercentage: {
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

universitySchema.index({ name: 1 });
universitySchema.index({ country: 1 });
universitySchema.index({ difficulty: 1 });

module.exports = mongoose.model("University", universitySchema);