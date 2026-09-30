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

    livingCostSource: {
      type: String,
      trim: true,
    },

    // Workbook Sheet7
    intakes: {
      type: [
        {
          _id: false,
          intake: String,
          classStart: String,
          applicationStart: String,
          applicationDeadline: String,
        },
      ],
      default: undefined,
    },

    // Workbook Sheet5
    admissionSteps: {
      type: [
        {
          _id: false,
          step: Number,
          process: String,
        },
      ],
      default: undefined,
    },

    // Workbook Sheet6
    requiredDocuments: {
      type: [
        {
          _id: false,
          document: String,
          purpose: String,
          mandatory: String,
        },
      ],
      default: undefined,
    },

    // Workbook Sheet8 (rows keyed by the original column headers)
    universitySuggestionGuide: {
      type: [mongoose.Schema.Types.Mixed],
      default: undefined,
    },

    // Workbook Sheet12
    gradeConversion: {
      type: [
        {
          _id: false,
          universityType: String,
          typicalMinimumCgpa: String,
          germanGradeEquivalent: String,
        },
      ],
      default: undefined,
    },

    // Workbook Sheets 9-11 (free-text guidance)
    referenceNotes: {
      type: [
        {
          _id: false,
          sheet: String,
          title: String,
          lines: [String],
        },
      ],
      default: undefined,
    },

    // University rows from other sheets that could not be linked to a Sheet2 university
    unlinkedUniversityRows: {
      type: [
        {
          _id: false,
          sheet: String,
          rowNumber: Number,
          name: String,
          reason: String,
          data: mongoose.Schema.Types.Mixed,
        },
      ],
      default: undefined,
    },

    excelSource: {
      type: mongoose.Schema.Types.Mixed,
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