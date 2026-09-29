const Payment = require("../models/Payment");

// GET all payments
const getPayments = async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payments",
      error: error.message,
    });
  }
};

// GET single payment
const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment",
      error: error.message,
    });
  }
};

// CREATE payment
const createPayment = async (req, res) => {
  try {
    const payment = await Payment.create(req.body);

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: payment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create payment",
      error: error.message,
    });
  }
};

// UPDATE payment
const updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findOneAndUpdate(
      {
        $or: [
          { _id: req.params.id },
          { id: req.params.id },
        ],
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Payment updated successfully",
      data: payment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update payment",
      error: error.message,
    });
  }
};

// DELETE payment
const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findOneAndDelete({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Payment deleted successfully",
      data: payment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete payment",
      error: error.message,
    });
  }
};

module.exports = {
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
};