const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
    },

    studentExternalId: {
      type: String,
      trim: true,
    },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
    },

    applicationExternalId: {
      type: String,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      trim: true,
      default: "USD",
    },

    type: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      trim: true,
    },

    paymentMethod: {
      type: String,
      trim: true,
    },

    transactionId: {
      type: String,
      trim: true,
    },

    paymentDate: {
      type: String,
      trim: true,
    },

    dueDate: {
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

paymentSchema.index({ studentExternalId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ transactionId: 1 });

module.exports = mongoose.model("Payment", paymentSchema);