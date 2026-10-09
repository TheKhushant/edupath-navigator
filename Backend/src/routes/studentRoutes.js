const express = require("express");
const Student = require("../models/Student");
const { bulkDeleteHandler } = require("../utils/bulkDelete");

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
router.post("/bulk-delete", bulkDeleteHandler(Student, "students"));

// UPDATE student
router.patch("/:id", updateStudent);

// DELETE student
router.delete("/:id", deleteStudent);

module.exports = router;