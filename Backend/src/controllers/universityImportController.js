const express = require("express");

const {
  LIMITS,
  ImportError,
  analyzeWorkbook,
  executeImport,
  buildTemplate,
} = require("../services/universityExcelImport");

// The workbook is sent as the raw request body (application/octet-stream);
// options travel in the query string. Parsed here so a too-large upload
// returns a JSON error instead of Express's default HTML page.
const rawParser = express.raw({
  type: () => true,
  limit: LIMITS.maxFileBytes,
});

const readUpload = (req, res, next) => {
  rawParser(req, res, (error) => {
    if (!error) return next();

    const tooLarge = error.type === "entity.too.large";

    res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge
        ? `File is larger than ${LIMITS.maxFileBytes / 1024 / 1024} MB.`
        : "The upload could not be read.",
    });
  });
};

const optionsFrom = (req) => ({
  fileName: String(req.query.fileName ?? ""),
  defaultCountry: String(req.query.defaultCountry ?? ""),
  mode: req.query.mode === "update" ? "update" : "skip",
});

const handleError = (res, error, fallback) => {
  if (error instanceof ImportError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(fallback, error);

  return res.status(500).json({ success: false, message: fallback, error: error.message });
};

// GET /api/universities/import/template
const downloadTemplate = (req, res) => {
  try {
    const buffer = buildTemplate();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="university-import-template.xlsx"',
    );

    res.status(200).send(buffer);
  } catch (error) {
    handleError(res, error, "Failed to create the Excel template");
  }
};

// POST /api/universities/import/preview  (does not modify MongoDB)
const previewImport = async (req, res) => {
  try {
    const { preview } = await analyzeWorkbook(req.body, optionsFrom(req));

    res.status(200).json({ success: true, data: preview });
  } catch (error) {
    handleError(res, error, "Failed to scan the Excel file");
  }
};

// POST /api/universities/import/confirm
const confirmImport = async (req, res) => {
  try {
    const options = optionsFrom(req);
    const { preview, plan } = await analyzeWorkbook(req.body, options);

    const expectedHash = String(req.query.expectedHash ?? "");

    if (!expectedHash || expectedHash !== preview.sha256) {
      throw new ImportError("The uploaded file does not match the scanned file. Scan the file again before importing.", 409);
    }

    if (plan.mode === "update" && plan.updates.length > 0 && req.query.confirmOverwrite !== "true") {
      throw new ImportError("Updating existing universities requires explicit confirmation.");
    }

    if (!preview.canImport) {
      throw new ImportError("There are no valid rows to import.");
    }

    const result = await executeImport(plan);

    res.status(201).json({
      success: true,
      message: "Excel import completed",
      data: {
        importId: result.importId,
        transactional: result.transactional,
        fileName: preview.fileName,
        summary: {
          sheetsScanned: preview.summary.sheetsScanned,
          rowsScanned: preview.summary.rowsScanned,
          imported: result.created.length,
          updated: result.updated.length,
          skipped: preview.summary.skippedRows,
          duplicates: preview.summary.duplicateRows,
          invalid: preview.summary.invalidRows,
          unlinked: preview.summary.unlinkedRows,
          errors: preview.summary.errors,
          warnings: preview.summary.warnings,
        },
        universities: [...result.created, ...result.updated],
      },
    });
  } catch (error) {
    handleError(res, error, "Failed to import the Excel file");
  }
};

module.exports = {
  readUpload,
  downloadTemplate,
  previewImport,
  confirmImport,
};
