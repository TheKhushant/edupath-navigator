const mongoose = require("mongoose");

const countrySchema = new mongoose.Schema(
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

    code: {
      type: String,
      trim: true,
      uppercase: true,
    },

    currency: {
      type: String,
      trim: true,
    },

    averageLivingCost: {
      type: Number,
    },

    description: {
      type: String,
      trim: true,
    },

    popular: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

countrySchema.index({ name: 1 });

module.exports = mongoose.model("Country", countrySchema);