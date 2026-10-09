const mongoose = require("mongoose");

// A field added by a user during an Excel import (not part of the core
// University / UniversityCourse schema). Values live in the record's
// customFields object; this document records the field's name and type so
// later imports can recognise and reuse it.
const customFieldDefinitionSchema = new mongoose.Schema(
  {
    // Which records the field belongs to
    entity: {
      type: String,
      enum: ["university", "course"],
      required: true,
    },

    // Property name inside customFields (validated in services/customFields.js)
    key: {
      type: String,
      required: true,
      trim: true,
    },

    // Display name, e.g. the Excel header the field was created from
    label: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["string", "number", "boolean", "date", "array", "object"],
      required: true,
    },

    // Import that created the field
    createdByImport: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

customFieldDefinitionSchema.index({ entity: 1, key: 1 }, { unique: true });

module.exports = mongoose.model("CustomFieldDefinition", customFieldDefinitionSchema);
