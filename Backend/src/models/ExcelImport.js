const mongoose = require("mongoose");

// Audit record for each confirmed University Excel import. Keeps the scan
// summary, validation issues and any sheet data that was not imported into
// University documents, so no workbook information is lost.
const excelImportSchema = new mongoose.Schema(
  {
    importId: {
      type: String,
      required: true,
      unique: true,
    },

    fileName: String,
    fileSize: Number,
    sha256: String,

    options: {
      type: mongoose.Schema.Types.Mixed,
    },

    summary: {
      type: mongoose.Schema.Types.Mixed,
    },

    sheets: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    issues: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Rows/sheets that were not written to universities (unrecognized sheets,
    // unlinked related rows, invalid rows), kept with their original values.
    preservedRows: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    createdUniversityIds: {
      type: [String],
      default: [],
    },

    updatedUniversityIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ExcelImport", excelImportSchema);
