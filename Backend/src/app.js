const express = require("express");
const cors = require("cors");
const studentRoutes = require("./routes/studentRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const app = express();
const universityRoutes = require("./routes/universityRoutes");
const universityCourseRoutes = require("./routes/universityCourseRoutes");
const courseRoutes = require("./routes/courseRoutes");
const countryRoutes = require("./routes/countryRoutes");
const documentRoutes = require("./routes/documentRoutes");
const visaCaseRoutes = require("./routes/visaCaseRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const followUpRoutes = require("./routes/followUpRoutes");
const notificationRoutes = require("./routes/notificationRoutes");


app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/students", studentRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/universities", universityRoutes);
app.use("/api/university-courses", universityCourseRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/countries", countryRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/visa-cases", visaCaseRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/follow-ups", followUpRoutes);
app.use("/api/notifications", notificationRoutes);


app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "EduPath Navigator API is running",
  });
});

module.exports = app;