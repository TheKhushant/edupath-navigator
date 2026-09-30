const Document = require("../models/Document");
const { idFilter } = require("../utils/idFilter");

// GET all documents
const getDocuments = async (req, res) => {
  try {
    const documents = await Document.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: documents.length,
      data: documents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch documents",
      error: error.message,
    });
  }
};

// GET single document
const getDocumentById = async (req, res) => {
  try {
    const document = await Document.findOne(idFilter(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    res.status(200).json({
      success: true,
      data: document,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch document",
      error: error.message,
    });
  }
};

// CREATE document
const createDocument = async (req, res) => {
  try {
    const document = await Document.create(req.body);

    res.status(201).json({
      success: true,
      message: "Document created successfully",
      data: document,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create document",
      error: error.message,
    });
  }
};

// UPDATE document
const updateDocument = async (req, res) => {
  try {
    const document = await Document.findOneAndUpdate(
      idFilter(req.params.id),
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Document updated successfully",
      data: document,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update document",
      error: error.message,
    });
  }
};

// DELETE document
const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findOneAndDelete(idFilter(req.params.id));

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
      data: document,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete document",
      error: error.message,
    });
  }
};

module.exports = {
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
};