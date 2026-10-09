const mongoose = require("mongoose");

// One document per (scope, normalized query): how often it was searched,
// how often it returned nothing, and whether the tag dictionary expanded it.
// Used to find terms that are missing from the search tag dictionary.
const searchLogSchema = new mongoose.Schema(
  {
    // "courses" or "university-courses"
    scope: {
      type: String,
      required: true,
    },

    key: {
      type: String,
      required: true,
    },

    // Last raw query as typed
    query: String,

    count: {
      type: Number,
      default: 0,
    },

    zeroResultCount: {
      type: Number,
      default: 0,
    },

    expandedCount: {
      type: Number,
      default: 0,
    },

    lastResultCount: Number,

    lastSearchedAt: Date,
  },
  {
    timestamps: true,
  }
);

searchLogSchema.index({ scope: 1, key: 1 }, { unique: true });
searchLogSchema.index({ scope: 1, count: -1 });
searchLogSchema.index({ scope: 1, lastResultCount: 1, zeroResultCount: -1 });

module.exports = mongoose.model("SearchLog", searchLogSchema);
