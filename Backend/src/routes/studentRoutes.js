const express = require("express");

const {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
} = require("../controllers/studentController");

const router = express.Router();

// GET all students
router.get("/", getStudents);

// GET single student
router.get("/:id", getStudentById);

// CREATE student
router.post("/", createStudent);

// UPDATE student
router.patch("/:id", updateStudent);

// DELETE student
router.delete("/:id", deleteStudent);

module.exports = router;