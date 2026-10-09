const University = require("../models/University");

// GET all universities
const getUniversities = async (req, res) => {
  try {
    const universities = await University.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: universities.length,
      data: universities,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch universities",
      error: error.message,
    });
  }
};

// GET single university
const getUniversityById = async (req, res) => {
  try {
    const university = await University.findOne({
      id: req.params.id,
    });

    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found",
      });
    }

    res.status(200).json({
      success: true,
      data: university,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch university",
      error: error.message,
    });
  }
};

// customFields are written only by the Excel import, which validates them
// against their CustomFieldDefinition; the plain CRUD body cannot set them.
const withoutCustomFields = (body = {}) =>
  Object.fromEntries(
    Object.entries(body ?? {})
      .filter(([key]) => key !== "customFields" && !key.startsWith("customFields."))
      // Also inside update operators such as $set / $unset
      .map(([key, value]) =>
        key.startsWith("$") && value && typeof value === "object" ? [key, withoutCustomFields(value)] : [key, value],
      ),
  );

// CREATE university
const createUniversity = async (req, res) => {
  try {
    const university = await University.create(withoutCustomFields(req.body));

    res.status(201).json({
      success: true,
      message: "University created successfully",
      data: university,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create university",
      error: error.message,
    });
  }
};

// UPDATE university
const updateUniversity = async (req, res) => {
  try {
    const university = await University.findOneAndUpdate(
      { id: req.params.id },
      withoutCustomFields(req.body),
      {
        new: true,
        runValidators: true,
      },
    );

    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "University updated successfully",
      data: university,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update university",
      error: error.message,
    });
  }
};

// DELETE university
const deleteUniversity = async (req, res) => {
  try {
    const university = await University.findOneAndDelete({
      id: req.params.id,
    });

    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "University deleted successfully",
      data: university,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete university",
      error: error.message,
    });
  }
};

module.exports = {
  getUniversities,
  getUniversityById,
  createUniversity,
  updateUniversity,
  deleteUniversity,
};