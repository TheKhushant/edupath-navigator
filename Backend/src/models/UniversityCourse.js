const mongoose = require("mongoose");
const { searchablePlugin } = require("../services/courseSearch");
const { isValidCustomFields } = require("../services/customFields");

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

    // ---------- Programme details from the University Excel import ----------

    // Annual tuition as written in the source (tuitionFee is the general fee note);
    // tuitionMin / tuitionMax hold the parsed EUR amount when there is one.
    annualTuitionFee: {
      type: String,
      trim: true,
    },

    // Programme category as given by the source (subjectArea is the course category)
    category: {
      type: String,
      trim: true,
    },

    germanRequirement: {
      type: String,
      trim: true,
    },

    // Credits the applicant's previous degree must have (ects is the programme's own total)
    ectsRequired: {
      type: String,
      trim: true,
    },

    workExperience: {
      type: String,
      trim: true,
    },

    backlogsAllowed: {
      type: String,
      trim: true,
    },

    apsRequired: {
      type: String,
      trim: true,
    },

    gapAllowed: {
      type: String,
      trim: true,
    },

    recommendedIndianPercentage: {
      type: String,
      trim: true,
    },

    // Core modules / major subjects of the programme
    majorCourses: {
      type: [String],
      default: undefined,
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

    // Fields added by users during an Excel import (not core course fields).
    // Validated object: keys are CustomFieldDefinition keys (see services/customFields.js).
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      validate: {
        validator: isValidCustomFields,
        message: "customFields must be an object of simple values with camelCase keys",
      },
    },

    // Uploaded columns kept as additional information (not mapped to a field)
    extraFields: {
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