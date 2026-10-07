const mongoose = require("mongoose");
const { searchablePlugin } = require("../services/courseSearch");

const universityCourseSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
    },

    universityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "University",
    },

    universityExternalId: {
      type: String,
      trim: true,
    },

    universityName: {
      type: String,
      trim: true,
    },

    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },

    courseExternalId: {
      type: String,
      trim: true,
    },

    courseName: {
      type: String,
      required: true,
      trim: true,
    },

    canonicalCourse: {
      type: String,
      trim: true,
    },

    aliases: {
      type: [String],
      default: [],
    },

    degree: {
      type: String,
      trim: true,
    },

    degreeLevel: {
      type: String,
      trim: true,
    },

    specialization: {
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

    tuitionMin: {
      type: Number,
    },

    tuitionMax: {
      type: Number,
    },

    tuitionFee: {
      type: String,
      trim: true,
    },

    tuitionCurrency: {
      type: String,
      trim: true,
    },

    tuitionPeriod: {
      type: String,
      trim: true,
    },

    applicationFee: {
      type: String,
      trim: true,
    },

    intake: {
      type: String,
      trim: true,
    },

    applicationStartDate: {
      type: String,
      trim: true,
    },

    applicationDeadline: {
      type: String,
      trim: true,
    },

    requiredDegree: {
      type: String,
      trim: true,
    },

    minimumGpa: {
      type: String,
      trim: true,
    },

    ielts: {
      type: String,
      trim: true,
    },

    toefl: {
      type: String,
      trim: true,
    },

    gre: {
      type: String,
      trim: true,
    },

    eligibility: {
      type: String,
      trim: true,
    },

    requirements: {
      type: [String],
      default: [],
    },

    entranceExam: {
      type: String,
      trim: true,
    },

    interview: {
      type: String,
      trim: true,
    },

    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "Very Hard"],
    },

    lastVerified: {
      type: String,
      trim: true,
    },

    sourceUrl: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },

    // ---------- External programme source (e.g. Hochschulkompass import) ----------

    // Provider the record was imported from, e.g. "hochschulkompass"
    source: {
      type: String,
      trim: true,
    },

    // Provider's own programme id, when the source supplies one
    sourceRecordId: {
      type: String,
      trim: true,
    },

    // Deterministic duplicate key within the source (see importHochschulkompass.js)
    sourceKey: {
      type: String,
      trim: true,
    },

    // e.g. "Second cycle"
    studyType: {
      type: String,
      trim: true,
    },

    // e.g. "full-time"
    studyMode: {
      type: String,
      trim: true,
    },

    // e.g. "local admission restriction"
    admissionMode: {
      type: String,
      trim: true,
    },

    // How to apply, e.g. "uni-assist", "Directly to the university", "Hochschulstart"
    applicationMethod: {
      type: String,
      trim: true,
    },

    subjectArea: {
      type: String,
      trim: true,
    },

    ects: {
      type: Number,
    },

    // Programme location (can differ from the university's main campus)
    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    // The university's own programme page (sourceUrl is the provider's page)
    programmeUrl: {
      type: String,
      trim: true,
    },

    importId: {
      type: String,
      trim: true,
    },

    importedAt: {
      type: Date,
    },

    // Original source record exactly as it was imported
    sourceRow: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Imported programmes must be unique per source. Records without a source
// (all pre-existing data) are outside the partial index and unaffected.
universityCourseSchema.index(
  { source: 1, sourceKey: 1 },
  { unique: true, partialFilterExpression: { source: { $exists: true } } },
);

// Search tags + ranked search (see services/courseSearch.js)
universityCourseSchema.plugin(searchablePlugin, {
  scope: "university-courses",
  nameField: "courseName",
  specializationField: "specialization",
  tagFields: ["courseName", "specialization", "canonicalCourse", "aliases"],
  textFields: ["courseName", "specialization", "universityName"],
});

universityCourseSchema.index({ courseName: 1 });
universityCourseSchema.index({ universityExternalId: 1 });
universityCourseSchema.index({ courseExternalId: 1 });
universityCourseSchema.index({ difficulty: 1 });
// University & Course Explorer filters
universityCourseSchema.index({ universityId: 1 });
universityCourseSchema.index({ degree: 1 });
universityCourseSchema.index({ city: 1 });
universityCourseSchema.index({ studyMode: 1 });
universityCourseSchema.index({ subjectArea: 1 });

module.exports = mongoose.model(
  "UniversityCourse",
  universityCourseSchema
);