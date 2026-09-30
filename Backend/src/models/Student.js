const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
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

    initials: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    mobile: {
      type: String,
      trim: true,
    },

    qualification: {
      type: String,
      trim: true,
    },

    branch: {
      type: String,
      trim: true,
    },

    cgpa: {
      type: String,
      trim: true,
    },

    graduationYear: {
      type: Number,
    },

    desiredCourse: {
      type: String,
      trim: true,
    },

    specialization: {
      type: String,
      trim: true,
    },

    preferredCountries: {
      type: [String],
      default: [],
    },

    intake: {
      type: String,
      trim: true,
    },

    budget: {
      type: String,
      trim: true,
    },

    ielts: {
      type: String,
      trim: true,
    },

    german: {
      type: String,
      trim: true,
    },

    japanese: {
      type: String,
      trim: true,
    },

    counsellor: {
      type: String,
      trim: true,
    },

    stage: {
      type: String,
      trim: true,
    },

    lastFollowUp: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },

    service: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

studentSchema.index({ name: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ service: 1 });

module.exports = mongoose.model("Student", studentSchema);