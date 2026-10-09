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
//
// Optional column selections (include/exclude + target field per column)
// are sent as UTF-8 JSON in front of the workbook bytes, with their byte
// length in ?selectionsLength=N. They can be too large for a query string
// or header, and this keeps a single request without multipart parsing.
const MAX_SELECTIONS_BYTES = 256 * 1024;

const rawParser = express.raw({
  type: () => true,
  limit: LIMITS.maxFileBytes + MAX_SELECTIONS_BYTES,
});

const readUpload = (req, res, next) => {
  rawParser(req, res, (error) => {
    if (!error) {
      try {
        splitSelections(req);
        return next();
      } catch (splitError) {
        return handleError(res, splitError, "The upload could not be read.");
      }
    }

    const tooLarge = error.type === "entity.too.large";

    res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge
        ? `File is larger than ${LIMITS.maxFileBytes / 1024 / 1024} MB.`
        : "The upload could not be read.",
    });
  });
};

/** Moves leading selections JSON (if any) to req.columnSelections; req.body becomes the workbook. */
function splitSelections(req) {
  if (req.query.selectionsLength === undefined) return;

  const length = Number(req.query.selectionsLength);
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!Number.isInteger(length) || length <= 0 || length > MAX_SELECTIONS_BYTES || length > body.length) {
    throw new ImportError("Column selections are missing or too large.");
  }

  try {
    req.columnSelections = JSON.parse(body.subarray(0, length).toString("utf8"));
  } catch {
    throw new ImportError("Column selections are not valid JSON.");
  }

  req.body = body.subarray(length);
}

const progress = require("../services/importProgress");

const optionsFrom = (req) => ({
  fileName: String(req.query.fileName ?? ""),
  defaultCountry: String(req.query.defaultCountry ?? ""),
  mode: req.query.mode === "update" ? "update" : "skip",
  columnSelections: req.columnSelections,
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

// GET /api/universities/import/progress/:progressId
// Progress of a running preview/confirm that was sent with ?progressId=...
// data is null until the request with this id has reached the server (or after it expired).
const importProgress = (req, res) => {
  if (!progress.isValidId(req.params.progressId)) {
    return res.status(400).json({ success: false, message: "Invalid progress id." });
  }

  res.status(200).json({ success: true, data: progress.get(req.params.progressId) ?? null });
};

// POST /api/universities/import/preview  (does not modify MongoDB)
const previewImport = async (req, res) => {
  const update = progress.track(String(req.query.progressId ?? ""), "preview");

  try {
    const { preview } = await analyzeWorkbook(req.body, { ...optionsFrom(req), onProgress: update });

    update({ phase: "done", done: true });
    res.status(200).json({ success: true, data: preview });
  } catch (error) {
    update({ phase: "failed", done: true, error: error.message });
    handleError(res, error, "Failed to scan the Excel file");
  }
};

// POST /api/universities/import/confirm
const confirmImport = async (req, res) => {
  const update = progress.track(String(req.query.progressId ?? ""), "import");

  try {
    const options = optionsFrom(req);
    const { preview, plan } = await analyzeWorkbook(req.body, { ...options, onProgress: update });

    const expectedHash = String(req.query.expectedHash ?? "");

    if (!expectedHash || expectedHash !== preview.sha256) {
      throw new ImportError("The uploaded file does not match the scanned file. Scan the file again before importing.", 409);
    }

    if (plan.mode === "update" && plan.updates.length > 0 && req.query.confirmOverwrite !== "true") {
      throw new ImportError("Updating existing universities requires explicit confirmation.");
    }

    if (plan.mode === "update" && plan.courseUpdates.length > 0 && req.query.confirmOverwrite !== "true") {
      throw new ImportError("Updating existing courses requires explicit confirmation.");
    }

    if (plan.newCustomFields.length > 0 && req.query.confirmCustomFields !== "true") {
      throw new ImportError(
        `Creating ${plan.newCustomFields.length} new database field(s) requires explicit confirmation.`,
      );
    }

    if (preview.mappingErrors > 0) {
      throw new ImportError("Some selected columns are not mapped correctly. Fix the column mapping and scan again.");
    }

    if (!preview.canImport) {
      throw new ImportError("There are no valid rows to import.");
    }

    const result = await executeImport(plan, { onProgress: update });
    update({ phase: "done", done: true });

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
          coursesImported: result.createdCourses.length,
          coursesUpdated: result.updatedCourses.length,
          importedRows: preview.importRowCount,
          skipped: preview.summary.skippedRows,
          duplicates: preview.summary.duplicateRows,
          invalid: preview.summary.invalidRows,
          unlinked: preview.summary.unlinkedRows,
          errors: preview.summary.errors,
          warnings: preview.summary.warnings,
        },
        universities: [...result.created, ...result.updated],
        courses: [...result.createdCourses, ...result.updatedCourses],
        customFields: result.createdCustomFields,
        // Rows that were not imported because of errors, with the reason and fix
        failedRows: preview.issues
          .filter((issue) => issue.severity === "ERROR" && issue.row !== null)
          .slice(0, 500)
          .map(({ sheet, row, column, message, value, suggestion }) => ({ sheet, row, column, message, value, suggestion })),
      },
    });
  } catch (error) {
    update({ phase: "failed", done: true, error: error.message });
    handleError(res, error, "Failed to import the Excel file");
  }
};

module.exports = {
  readUpload,
  downloadTemplate,
  previewImport,
  confirmImport,
  importProgress,
};
