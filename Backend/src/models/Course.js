const mongoose = require("mongoose");
const { searchablePlugin } = require("../services/courseSearch");

const courseSchema = new mongoose.Schema(
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

    degree: {
      type: String,
      trim: true,
    },

    level: {
      type: String,
      trim: true,
    },

    specialization: {
      type: String,
      trim: true,
    },

    country: {
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

    requirements: {
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

    field: {
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

// Search tags + ranked search (see services/courseSearch.js)
courseSchema.plugin(searchablePlugin, {
  scope: "courses",
  nameField: "name",
  specializationField: "specialization",
  tagFields: ["name", "specialization"],
  textFields: ["name", "country", "specialization"],
});

courseSchema.index({ name: 1 });
courseSchema.index({ country: 1 });
courseSchema.index({ status: 1 });

module.exports = mongoose.model("Course", courseSchema);