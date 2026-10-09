const mongoose = require("mongoose");
const { searchablePlugin } = require("../services/courseSearch");
const { isValidCustomFields } = require("../services/customFields");

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

    annualTuitionFee: {
      type: String,
      trim: true,
    },

    recommendedIndianPercentage: {
      type: String,
      trim: true,
    },

    sheet2Data: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Normalized Sheet2 university name; the Germany seed upserts on it.
    sourceKey: {
      type: String,
      trim: true,
    },

    // Other Sheet2 rows with the same university name (Sheet2 lists a few twice).
    sheet2DuplicateRows: {
      type: [mongoose.Schema.Types.Mixed],
      default: undefined,
    },

    rankingSource: {
      type: String,
      trim: true,
    },

    // Workbook Sheet1: admission difficulty tier per field of study.
    admissionDifficulty: {
      type: [
        {
          _id: false,
          field: String,
          level: String,
          markedPrivate: Boolean,
          sourceName: String,
          sheet: String,
          rowNumber: Number,
        },
      ],
      default: undefined,
    },

    // Original rows from other workbook sheets that were linked to this university.
    linkedSheetRows: {
      type: [
        {
          _id: false,
          sheet: String,
          rowNumber: Number,
          sourceName: String,
          data: mongoose.Schema.Types.Mixed,
        },
      ],
      default: undefined,
    },

    notes: {
      type: String,
      trim: true,
    },

    // ---------- Excel import (University section upload) ----------

    // Where the record came from: file, sheet, original row, import batch
    importSource: {
      type: {
        _id: false,
        fileName: String,
        sheet: String,
        rowNumber: Number,
        importId: String,
        importedAt: Date,
      },
      default: undefined,
    },

    // Original row exactly as it appeared in the uploaded sheet (header -> value)
    sourceRow: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Columns that are not part of the standard template, preserved as-is
    extraFields: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Other rows in the upload with the same university name
    duplicateSourceRows: {
      type: [mongoose.Schema.Types.Mixed],
      default: undefined,
    },

    // ---------- External programme source (e.g. Hochschulkompass import) ----------

    // Provider that created this university, e.g. "hochschulkompass"
    source: {
      type: String,
      trim: true,
    },

    // Provider's own institution id, when the source supplies one
    sourceRecordId: {
      type: String,
      trim: true,
    },

    // Fields added by users during an Excel import (not core university fields).
    // Validated object: keys are CustomFieldDefinition keys (see services/customFields.js).
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator: isValidCustomFields,
        message: "customFields must be an object of simple values with camelCase keys",
      },
    },

    // e.g. "Universität", "Fachhochschule / HAW", "Kunst- und Musikhochschule"
    universityType: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Search tags + ranked search (see services/courseSearch.js). Universities are
// found by the concepts in their name and popular courses ("AI" -> TUM).
universitySchema.plugin(searchablePlugin, {
  scope: "universities",
  nameField: "name",
  specializationField: null,
  tagFields: ["name", "popularCourses"],
  textFields: ["name", "city", "country", "popularCourses"],
});

universitySchema.index({ name: 1 });
universitySchema.index({ country: 1 });
// University & Course Explorer filters
universitySchema.index({ country: 1, city: 1 });
universitySchema.index({ state: 1 });
universitySchema.index({ universityType: 1 });
universitySchema.index({ difficulty: 1 });
universitySchema.index({ sourceKey: 1 });

module.exports = mongoose.model("University", universitySchema);