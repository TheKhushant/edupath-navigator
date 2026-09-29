const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
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

    level: {
      type: String,
      trim: true,
    },

    field: {
      type: String,
      trim: true,
    },

    duration: {
      type: String,
      trim: true,
    },

    description: {
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

courseSchema.index({ name: 1 });
courseSchema.index({ field: 1 });

module.exports = mongoose.model("Course", courseSchema);