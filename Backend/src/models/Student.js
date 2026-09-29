const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
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

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    nationality: {
      type: String,
      trim: true,
    },

    dateOfBirth: {
      type: String,
      trim: true,
    },

    gender: {
      type: String,
      trim: true,
    },

    passportNumber: {
      type: String,
      trim: true,
    },

    passportExpiry: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
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

    country: {
      type: String,
      trim: true,
    },

    education: {
      type: String,
      trim: true,
    },

    degree: {
      type: String,
      trim: true,
    },

    university: {
      type: String,
      trim: true,
    },

    graduationYear: {
      type: Number,
    },

    cgpa: {
      type: Number,
    },

    percentage: {
      type: Number,
    },

    ieltsOverall: {
      type: Number,
    },

    ieltsListening: {
      type: Number,
    },

    ieltsReading: {
      type: Number,
    },

    ieltsWriting: {
      type: Number,
    },

    ieltsSpeaking: {
      type: Number,
    },

    preferredCountries: [
      {
        type: String,
        trim: true,
      },
    ],

    preferredCourse: {
      type: String,
      trim: true,
    },

    budget: {
      type: Number,
    },

    intake: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },

    source: {
      type: String,
      trim: true,
    },

    assignedTo: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);