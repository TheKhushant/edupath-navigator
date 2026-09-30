const mongoose = require("mongoose");

const countrySchema = new mongoose.Schema(
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

    code: {
      type: String,
      trim: true,
    },

    livingCostMin: {
      type: Number,
    },

    livingCostMax: {
      type: Number,
    },

    livingCostCurrency: {
      type: String,
      trim: true,
    },

    livingCostPeriod: {
      type: String,
      trim: true,
    },

    languageRequirements: {
      type: String,
      trim: true,
    },

    academicRequirements: {
      type: String,
      trim: true,
    },

    financialRequirements: {
      type: String,
      trim: true,
    },

    visaRequirements: {
      type: String,
      trim: true,
    },

    applicationProcess: {
      type: String,
      trim: true,
    },

    postStudy: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    notes: {
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

    popular: {
      type: Boolean,
      default: false,
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

countrySchema.index({ name: 1 });
countrySchema.index({ code: 1 });

module.exports = mongoose.model("Country", countrySchema);