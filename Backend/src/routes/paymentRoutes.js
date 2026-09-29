const express = require("express");

const {
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
} = require("../controllers/paymentController");

const router = express.Router();

router.get("/", getPayments);
router.get("/:id", getPaymentById);
router.post("/", createPayment);
router.patch("/:id", updatePayment);
router.delete("/:id", deletePayment);

module.exports = router;