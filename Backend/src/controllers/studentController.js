const Student = require("../models/Student");

// GET all students
const getStudents = async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch students",
      error: error.message,
    });
  }
};

// GET single student
const getStudentById = async (req, res) => {
  try {
    const student = await Student.findOne({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch student",
      error: error.message,
    });
  }
};

// CREATE student
const createStudent = async (req, res) => {
  try {
    const student = await Student.create(req.body);

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: student,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create student",
      error: error.message,
    });
  }
};

// UPDATE student
const updateStudent = async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
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

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Student updated successfully",
      data: student,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update student",
      error: error.message,
    });
  }
};

// DELETE student
const deleteStudent = async (req, res) => {
  try {
    const student = await Student.findOneAndDelete({
      $or: [
        { _id: req.params.id },
        { id: req.params.id },
      ],
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Student deleted successfully",
      data: student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete student",
      error: error.message,
    });
  }
};

module.exports = {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
};