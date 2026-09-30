const crypto = require("crypto");
const path = require("path");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const University = require("../models/University");
const ExcelImport = require("../models/ExcelImport");
const {
  clean,
  normalizeName,
  nameParts,
  swappedName,
  createNameMatcher,
} = require("../utils/universityNameMatching");

// ======================================================
// LIMITS
// ======================================================

const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxSheets: 30,
  maxRowsPerSheet: 5000,
  maxColumns: 60,
  maxCellLength: 2000,
  previewRowsPerSheet: 500,
  maxIssuesReturned: 2000,
};

const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];

class ImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ======================================================
// COLUMN DEFINITIONS
// ======================================================

const normalizeHeader = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[*:]+$/, "")
    .trim();

// Standard columns. A header maps to a column only on an exact
// (normalized) alias match; near-misses are reported, never auto-mapped.
const COLUMNS = [
  {
    key: "name",
    header: "University",
    aliases: ["university", "university name", "name of university"],
    description: "Full official university name. Required on every row.",
    example: "Technical University of Munich (TUM)",
  },
  {
    key: "country",
    header: "Country",
    aliases: ["country"],
    description: "Country of the university. Required (or set a default country during upload).",
    example: "Germany",
  },
  {
    key: "city",
    header: "City",
    aliases: ["city"],
    description: "City of the main campus.",
    example: "Munich",
  },
  {
    key: "annualTuitionFee",
    header: "Annual Tuition Fee (EUR)",
    aliases: ["annual tuition fee (eur)", "annual tuition fee", "tuition fee (eur)", "tuition fee"],
    description: "Annual tuition in EUR: a number or range, optionally with a note in brackets.",
    example: "0-3000 (Semester contribution)",
  },
  {
    key: "englishRequirement",
    header: "IELTS",
    aliases: ["ielts", "ielts requirement", "english requirement"],
    description: "Minimum IELTS band, 0-9 in steps of 0.5.",
    example: "6.5",
  },
  {
    key: "requirements",
    header: "Other Requirements",
    aliases: ["other requirements", "requirements"],
    description: "Other requirements separated by semicolons.",
    example: "APS Certificate; GRE for some programs",
  },
  {
    key: "applicationOpens",
    header: "Application Opens",
    aliases: ["application opens", "application start"],
    description: "Month, month range or date the application window opens.",
    example: "December",
  },
  {
    key: "applicationDeadline",
    header: "Application Deadline",
    aliases: ["application deadline", "deadline"],
    description: "Month, month range or date of the deadline.",
    example: "January-July",
  },
  {
    key: "popularCourses",
    header: "Major Courses",
    aliases: ["major courses", "courses", "popular courses"],
    description: "Courses separated by commas.",
    example: "Computer Science, Data Science, Engineering",
  },
  {
    key: "recommendedIndianPercentage",
    header: "Recommended Indian %",
    aliases: ["recommended indian %", "recommended indian percentage", "recommended percentage"],
    description: "Recommended Indian academic percentage, a number or range (0-100).",
    example: "75-85%+",
  },
  {
    key: "website",
    header: "Official Website",
    aliases: ["official website", "website"],
    description: "Full URL starting with http:// or https://.",
    example: "https://www.tum.de",
  },
  {
    key: "rankingSource",
    header: "Ranking Source",
    aliases: ["ranking source"],
    description: "Name of the ranking, e.g. QS World University Rankings 2026.",
    example: "QS World University Rankings 2026",
  },
  {
    key: "rank",
    header: "Rank",
    aliases: ["rank", "ranking"],
    // Also matches headers like "Rank (QS World University Rankings 2026)"
    matches: (header) => /^rank(ing)?\b/.test(header) && header !== "ranking source",
    description: "Rank position: a whole number or range such as 201-250.",
    example: "22",
  },
  {
    key: "field",
    header: "Field",
    aliases: ["field", "field of study"],
    description: "Field of study the difficulty applies to.",
    example: "Computer Science / AI / Data Science",
  },
  {
    key: "level",
    header: "Level",
    aliases: ["level", "difficulty", "admission difficulty"],
    description: `Admission difficulty: ${["Very Hard", "Hard", "Average", "Medium", "Easy"].join(", ")}.`,
    example: "Very Hard",
  },
];

const COLUMN_BY_KEY = new Map(COLUMNS.map((column) => [column.key, column]));

const MASTER_FIELD_KEYS = [
  "country",
  "city",
  "annualTuitionFee",
  "englishRequirement",
  "requirements",
  "applicationOpens",
  "applicationDeadline",
  "popularCourses",
  "recommendedIndianPercentage",
];

const DIFFICULTY_LEVELS = ["Very Hard", "Hard", "Average", "Medium", "Easy"];

const SHEET_PURPOSES = {
  universities: "University data (creates or updates universities)",
  rankings: "Rankings linked to universities",
  websites: "Official websites linked to universities",
  admissionDifficulty: "Admission difficulty by field linked to universities",
  instructions: "Template instructions (not imported)",
  unrecognized: "Not recognized (preserved in the import log, not imported)",
  empty: "Empty sheet",
};

// Template sheets (Instructions is generated separately)
const TEMPLATE_SHEETS = [
  {
    name: "Universities",
    type: "universities",
    columns: [
      "name",
      "country",
      "city",
      "annualTuitionFee",
      "englishRequirement",
      "requirements",
      "applicationOpens",
      "applicationDeadline",
      "popularCourses",
      "recommendedIndianPercentage",
      "website",
    ],
  },
  { name: "Rankings", type: "rankings", columns: ["rank", "name", "rankingSource"] },
  { name: "Websites", type: "websites", columns: ["name", "website"] },
  { name: "Admission Difficulty", type: "admissionDifficulty", columns: ["name", "field", "level"] },
];

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = temp;
    }
  }

  return previous[b.length];
}

function mapHeader(normalized) {
  if (!normalized) return undefined;

  return COLUMNS.find(
    (column) => column.aliases.includes(normalized) || column.matches?.(normalized),
  );
}

/** Closest standard header for a misspelled one, or undefined. */
function suggestHeader(normalized) {
  if (normalized.length < 3) return undefined;

  let best;

  for (const column of COLUMNS) {
    for (const alias of column.aliases) {
      const distance = levenshtein(normalized, alias);
      const allowed = alias.length > 12 ? 3 : 2;

      if (distance <= allowed && (!best || distance < best.distance)) {
        best = { column, distance };
      }
    }
  }

  return best?.column;
}

// ======================================================
// VALUE PARSING / VALIDATION HELPERS
// ======================================================

const MONTH_RE =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;

const FLEXIBLE_DATE_RE =
  /\b(multiple|rolling|varies|various|open|intakes?|dates?|year[- ]round|continuous|tbd|tba)\b/i;

const OTHER_CURRENCY_RE = /\$|£|₹|\busd\b|\bgbp\b|\binr\b|\baud\b|\bcad\b/i;

const extractNumbers = (text) =>
  [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter((number) => Number.isFinite(number));

const isValidUrl = (text) => {
  if (!/^https?:\/\//i.test(text)) return false;

  try {
    const url = new URL(text);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
};

function validateDateText(text) {
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dmy || iso) {
    const [day, month, year] = iso
      ? [Number(iso[3]), Number(iso[2]), Number(iso[1])]
      : [Number(dmy[1]), Number(dmy[2]), Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])];

    const date = new Date(Date.UTC(year, month - 1, day));
    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;

    return valid
      ? { ok: true }
      : { ok: false, severity: "ERROR", message: "Invalid date", suggestion: "Use DD/MM/YYYY with a real calendar date, or a month name such as \"December\"" };
  }

  if (MONTH_RE.test(text) || FLEXIBLE_DATE_RE.test(text)) {
    return { ok: true };
  }

  return {
    ok: false,
    severity: "WARNING",
    message: "Not a recognised month or date; stored as text",
    suggestion: "Use a month (\"December\"), a month range (\"January-July\") or a date (DD/MM/YYYY)",
  };
}

// ======================================================
// FILE CHECKS AND WORKBOOK READING
// ======================================================

function checkFile(buffer, fileName) {
  if (!buffer || buffer.length === 0) {
    throw new ImportError("No file was uploaded or the file is empty.");
  }

  if (buffer.length > LIMITS.maxFileBytes) {
    throw new ImportError(`File is larger than ${LIMITS.maxFileBytes / 1024 / 1024} MB.`, 413);
  }

  const extension = path.extname(clean(fileName)).toLowerCase();

  if (extension === ".xlsm" || extension === ".xlsb") {
    throw new ImportError("Macro-enabled or binary workbooks (.xlsm, .xlsb) are not accepted. Save the file as .xlsx.");
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new ImportError(`Unsupported file type "${extension || "none"}". Upload an .xlsx or .xls file.`);
  }

  const signature = buffer.subarray(0, 8).toString("hex");
  const isZip = signature.startsWith("504b0304");
  const isOle = signature === "d0cf11e0a1b11ae1";

  if ((extension === ".xlsx" && !isZip) || (extension === ".xls" && !isOle)) {
    throw new ImportError("The file content is not a valid Excel workbook (file signature does not match its extension).");
  }

  if (isZip && buffer.includes("xl/vbaProject.bin")) {
    throw new ImportError("The workbook contains macros. Macro-enabled workbooks are not accepted.");
  }
}

function readWorkbook(buffer) {
  try {
    // Formulas are never evaluated: SheetJS only reads the cached values.
    return XLSX.read(buffer, {
      type: "buffer",
      cellFormula: true,
      cellHTML: false,
      cellNF: true,
      cellText: true,
      cellDates: false,
      bookVBA: false,
      sheetRows: LIMITS.maxRowsPerSheet + 50,
    });
  } catch (error) {
    throw new ImportError(`The workbook could not be read. It may be corrupted or password-protected. (${error.message})`);
  }
}

const cleanCellText = (value) =>
  // eslint-disable-next-line no-control-regex
  String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

/** Reads the used area of a sheet as rows of { text, type, isDate }. */
function readSheet(sheet) {
  let maxRow = -1;
  let maxColumn = -1;

  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;

    const { r, c } = XLSX.utils.decode_cell(address);
    const cell = sheet[address];

    if (cell && (cell.v !== undefined && cell.v !== null && cell.v !== "")) {
      maxRow = Math.max(maxRow, r);
      maxColumn = Math.max(maxColumn, c);
    }
  }

  const fullRange = sheet["!fullref"] ? XLSX.utils.decode_range(sheet["!fullref"]) : undefined;

  const result = {
    rows: [],
    columnCount: maxColumn + 1,
    formulaCells: 0,
    errorCells: 0,
    truncatedCells: 0,
    tooManyRows: Boolean(fullRange && fullRange.e.r + 1 > LIMITS.maxRowsPerSheet + 50) || maxRow + 1 > LIMITS.maxRowsPerSheet + 20,
    tooManyColumns: maxColumn + 1 > LIMITS.maxColumns,
  };

  const columnLimit = Math.min(maxColumn, LIMITS.maxColumns - 1);

  for (let r = 0; r <= maxRow; r++) {
    const cells = [];

    for (let c = 0; c <= columnLimit; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];

      if (!cell || cell.v === undefined || cell.v === null) {
        cells.push({ text: "", type: "z", isDate: false });
        continue;
      }

      if (cell.f) result.formulaCells++;
      if (cell.t === "e") result.errorCells++;

      let text = cleanCellText(cell.w !== undefined ? cell.w : cell.v);

      if (text.length > LIMITS.maxCellLength) {
        text = text.slice(0, LIMITS.maxCellLength);
        result.truncatedCells++;
      }

      cells.push({
        text,
        type: cell.t,
        isDate: cell.t === "d" || (cell.t === "n" && Boolean(cell.z) && XLSX.SSF.is_date(cell.z)),
      });
    }

    result.rows.push({ rowNumber: r + 1, cells });
  }

  return result;
}

const isBlank = (cells) => cells.every((cell) => !cell.text);

// ======================================================
// ANALYSIS
// ======================================================

/**
 * Scans and validates the workbook and plans the import against the
 * current database. Never writes to MongoDB.
 */
async function analyzeWorkbook(buffer, options) {
  const fileName = clean(options.fileName) || "upload.xlsx";
  const defaultCountry = clean(options.defaultCountry);
  const mode = options.mode === "update" ? "update" : "skip";

  checkFile(buffer, fileName);

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const workbook = readWorkbook(buffer);

  const issues = [];

  const addIssue = (issue) => {
    issues.push({
      severity: issue.severity,
      sheet: issue.sheet ?? "",
      row: issue.row ?? null,
      column: issue.column ?? "",
      code: issue.code,
      message: issue.message,
      value: issue.value ?? "",
      suggestion: issue.suggestion ?? "",
    });
  };

  if (!workbook.SheetNames.length) {
    throw new ImportError("The workbook contains no sheets.");
  }

  if (workbook.SheetNames.length > LIMITS.maxSheets) {
    addIssue({
      severity: "ERROR",
      code: "too_many_sheets",
      message: `Workbook has ${workbook.SheetNames.length} sheets; only the first ${LIMITS.maxSheets} are scanned.`,
      suggestion: "Split the workbook into smaller files.",
    });
  }

  // ---------- Read and classify every sheet ----------

  const sheets = workbook.SheetNames.slice(0, LIMITS.maxSheets).map((sheetName) => {
    const data = readSheet(workbook.Sheets[sheetName]);
    const nonBlankRows = data.rows.filter((row) => !isBlank(row.cells));

    const sheetInfo = {
      name: sheetName,
      type: "unrecognized",
      purpose: "",
      headerRowNumber: null,
      headers: [],
      columns: [],
      columnMap: new Map(),
      rowCount: 0,
      columnCount: data.columnCount,
      rows: [],
      raw: data,
      blankRows: 0,
    };

    if (data.formulaCells > 0) {
      addIssue({
        severity: "INFO",
        sheet: sheetName,
        code: "formulas",
        message: `${data.formulaCells} formula cell(s): the saved values are used; formulas are not executed.`,
      });
    }

    if (data.errorCells > 0) {
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "cell_errors",
        message: `${data.errorCells} cell(s) contain Excel errors (e.g. #DIV/0!, #REF!).`,
        suggestion: "Fix the formulas or replace them with values.",
      });
    }

    if (data.truncatedCells > 0) {
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "long_cells",
        message: `${data.truncatedCells} cell(s) were longer than ${LIMITS.maxCellLength} characters and were truncated.`,
      });
    }

    if (data.tooManyRows) {
      addIssue({
        severity: "ERROR",
        sheet: sheetName,
        code: "too_many_rows",
        message: `Sheet has more than ${LIMITS.maxRowsPerSheet} rows and will not be imported.`,
        suggestion: "Split the sheet into smaller files.",
      });
    }

    if (data.tooManyColumns) {
      addIssue({
        severity: "ERROR",
        sheet: sheetName,
        code: "too_many_columns",
        message: `Sheet has more than ${LIMITS.maxColumns} columns; extra columns are ignored and the sheet will not be imported.`,
      });
    }

    if (nonBlankRows.length === 0) {
      sheetInfo.type = "empty";
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "empty_sheet",
        message: "Sheet is empty.",
      });
      return sheetInfo;
    }

    if (normalizeHeader(sheetName) === "instructions") {
      sheetInfo.type = "instructions";
      sheetInfo.headerRowNumber = nonBlankRows[0].rowNumber;
      sheetInfo.headers = nonBlankRows[0].cells.map((cell) => cell.text);
      addIssue({
        severity: "INFO",
        sheet: sheetName,
        code: "instructions_sheet",
        message: "Template instructions sheet; not imported.",
      });
    } else {
      // Header row = first of the top rows containing a "University" column
      const headerRow =
        nonBlankRows
          .slice(0, 15)
          .find((row) => row.cells.some((cell) => mapHeader(normalizeHeader(cell.text))?.key === "name")) ??
        nonBlankRows[0];

      sheetInfo.headerRowNumber = headerRow.rowNumber;
      sheetInfo.headers = headerRow.cells.map((cell) => cell.text);

      if (headerRow !== nonBlankRows[0]) {
        addIssue({
          severity: "INFO",
          sheet: sheetName,
          row: headerRow.rowNumber,
          code: "header_offset",
          message: `Column headers found on row ${headerRow.rowNumber}; rows above it are treated as a title.`,
        });
      }
    }

    // ---------- Map columns ----------

    sheetInfo.columns = sheetInfo.headers.map((header, index) => {
      const normalized = normalizeHeader(header);

      if (!normalized) {
        return { index, header: "", status: "empty" };
      }

      if (sheetInfo.type === "instructions") {
        return { index, header, status: "unexpected" };
      }

      const column = mapHeader(normalized);

      if (column) {
        if (sheetInfo.columnMap.has(column.key)) {
          addIssue({
            severity: "ERROR",
            sheet: sheetName,
            row: sheetInfo.headerRowNumber,
            column: header,
            code: "duplicate_column",
            message: `Column "${header}" duplicates "${sheetInfo.headers[sheetInfo.columnMap.get(column.key)]}" (both map to ${column.header}).`,
            suggestion: "Remove or rename one of the columns.",
          });
          return { index, header, status: "duplicate" };
        }

        sheetInfo.columnMap.set(column.key, index);
        return { index, header, status: "mapped", mappedTo: column.key, mappedHeader: column.header };
      }

      const suggestion = suggestHeader(normalized);

      if (suggestion) {
        return { index, header, status: "suggested", suggestion: suggestion.header };
      }

      return { index, header, status: "unexpected" };
    });

    // ---------- Detect sheet type from its columns ----------

    if (sheetInfo.type !== "instructions") {
      const has = (key) => sheetInfo.columnMap.has(key);

      if (has("name") && MASTER_FIELD_KEYS.some(has)) sheetInfo.type = "universities";
      else if (has("name") && has("rank")) sheetInfo.type = "rankings";
      else if (has("name") && has("field") && has("level")) sheetInfo.type = "admissionDifficulty";
      else if (has("name") && has("website")) sheetInfo.type = "websites";
      else sheetInfo.type = "unrecognized";

      if (sheetInfo.type === "unrecognized") {
        addIssue({
          severity: "WARNING",
          sheet: sheetName,
          code: "unrecognized_sheet",
          message: has("name")
            ? "Sheet has a University column but no recognised data columns. It will not be imported; its data is preserved in the import log."
            : "Sheet has no \"University\" column, so its structure is not recognised. It will not be imported; its data is preserved in the import log.",
          suggestion: "Use the column names from the Excel template if this sheet should be imported.",
        });
      }

      if (["universities", "rankings", "websites", "admissionDifficulty"].includes(sheetInfo.type)) {
        const usedByType = {
          universities: ["name", ...MASTER_FIELD_KEYS, "website"],
          rankings: ["name", "rank", "rankingSource", "website"],
          websites: ["name", "website"],
          admissionDifficulty: ["name", "field", "level"],
        }[sheetInfo.type];

        for (const column of sheetInfo.columns) {
          if (column.status === "mapped" && !usedByType.includes(column.mappedTo)) {
            column.status = "unexpected";
            addIssue({
              severity: "INFO",
              sheet: sheetName,
              column: column.header,
              code: "column_not_used",
              message: `Column "${column.header}" is not used on a ${SHEET_PURPOSES[sheetInfo.type].toLowerCase()} sheet; values are preserved.`,
            });
          } else if (column.status === "suggested") {
            addIssue({
              severity: "WARNING",
              sheet: sheetName,
              column: column.header,
              code: "column_name",
              message: `Column "${column.header}" is not a template column. It looks like "${column.suggestion}" but is not mapped automatically; values are preserved.`,
              value: column.header,
              suggestion: `Rename the column to "${column.suggestion}".`,
            });
          } else if (column.status === "unexpected") {
            addIssue({
              severity: "INFO",
              sheet: sheetName,
              column: column.header,
              code: "extra_column",
              message: `Column "${column.header}" is not part of the standard template but will be preserved.`,
            });
          }
        }

        if (sheetInfo.type === "universities" && !has("country")) {
          addIssue({
            severity: defaultCountry ? "INFO" : "ERROR",
            sheet: sheetName,
            column: "Country",
            code: "missing_country_column",
            message: defaultCountry
              ? `No Country column; the default country "${defaultCountry}" is applied to every row.`
              : "Required column \"Country\" is missing.",
            suggestion: defaultCountry ? "" : "Add a Country column or set a default country before scanning.",
          });
        }
      }
    }

    sheetInfo.purpose = SHEET_PURPOSES[sheetInfo.type];

    // ---------- Data rows ----------

    const headerNorm = sheetInfo.headers.map(normalizeHeader).join("|");

    for (const row of data.rows) {
      if (row.rowNumber <= (sheetInfo.headerRowNumber ?? 0)) continue;

      if (isBlank(row.cells)) {
        sheetInfo.blankRows++;
        continue;
      }

      const texts = row.cells.map((cell) => cell.text);
      const isRepeatedHeader = texts.map(normalizeHeader).join("|") === headerNorm;

      const original = {};
      sheetInfo.headers.forEach((header, index) => {
        const value = texts[index];
        if (value) original[header || `Column ${index + 1}`] = value;
      });
      texts.forEach((value, index) => {
        if (index >= sheetInfo.headers.length && value) original[`Column ${index + 1}`] = value;
      });

      sheetInfo.rows.push({
        rowNumber: row.rowNumber,
        cells: row.cells,
        texts,
        original,
        status: isRepeatedHeader ? "header" : "pending",
        action: "",
      });

      if (isRepeatedHeader) {
        addIssue({
          severity: "INFO",
          sheet: sheetName,
          row: row.rowNumber,
          code: "repeated_header",
          message: "Repeated header row skipped.",
        });
      }
    }

    sheetInfo.rowCount = sheetInfo.rows.length;

    if (sheetInfo.blankRows > 0) {
      addIssue({
        severity: "INFO",
        sheet: sheetName,
        code: "blank_rows",
        message: `${sheetInfo.blankRows} blank row(s) ignored.`,
      });
    }

    if (["universities", "rankings", "websites", "admissionDifficulty"].includes(sheetInfo.type) &&
        sheetInfo.rows.every((row) => row.status === "header")) {
      addIssue({
        severity: "WARNING",
        sheet: sheetName,
        code: "no_data_rows",
        message: "Sheet has column headers but no data rows.",
      });
    }

    if (data.tooManyRows || data.tooManyColumns) {
      sheetInfo.blocked = true;
    }

    return sheetInfo;
  });

  // ---------- Helpers bound to a sheet/row ----------

  const cellOf = (sheetInfo, row, key) => {
    const index = sheetInfo.columnMap.get(key);
    return index === undefined ? undefined : row.cells[index] ?? { text: "", type: "z", isDate: false };
  };

  const headerOf = (sheetInfo, key) => {
    const index = sheetInfo.columnMap.get(key);
    return index === undefined ? COLUMN_BY_KEY.get(key).header : sheetInfo.headers[index];
  };

  const extraFieldsOf = (sheetInfo, row) => {
    const extra = {};
    sheetInfo.columns.forEach((column) => {
      if (column.status !== "mapped" && column.status !== "empty" && row.texts[column.index]) {
        extra[column.header] = row.texts[column.index];
      }
    });
    return Object.keys(extra).length ? extra : undefined;
  };

  // ======================================================
  // MASTER (UNIVERSITY) ROWS
  // ======================================================

  const masterRecords = [];

  for (const sheetInfo of sheets.filter((sheet) => sheet.type === "universities")) {
    for (const row of sheetInfo.rows) {
      if (row.status === "header") continue;

      if (sheetInfo.blocked) {
        row.status = "invalid";
        continue;
      }

      const rowIssues = [];
      const issue = (key, severity, code, message, suggestion = "", value) => {
        rowIssues.push(severity);
        addIssue({
          severity,
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: key ? headerOf(sheetInfo, key) : "",
          code,
          message,
          value: value ?? (key ? cellOf(sheetInfo, row, key)?.text ?? "" : ""),
          suggestion,
        });
      };

      const text = (key) => cellOf(sheetInfo, row, key)?.text ?? "";
      const record = {};

      // University name
      const nameCell = cellOf(sheetInfo, row, "name");

      if (!nameCell.text) {
        issue("name", "ERROR", "missing_name", "University name is missing.", "Enter the university name or delete the row.");
      } else if (nameCell.type === "n" || nameCell.type === "b") {
        issue("name", "ERROR", "invalid_type", "University name must be text, not a number or TRUE/FALSE.");
      } else if (nameCell.text.length < 3 || nameCell.text.length > 200) {
        issue("name", "ERROR", "invalid_name", "University name must be between 3 and 200 characters.");
      } else {
        record.name = nameCell.text;
      }

      // Country
      const countryCell = cellOf(sheetInfo, row, "country");

      if (countryCell?.text) {
        if (countryCell.type === "n" || /\d/.test(countryCell.text)) {
          issue("country", "ERROR", "invalid_country", "Country must be a country name.", "Enter the country name, e.g. \"Germany\".");
        } else {
          record.country = countryCell.text;
        }
      } else if (defaultCountry) {
        record.country = defaultCountry;
        if (countryCell) {
          issue("country", "INFO", "default_country", `Country is empty; default "${defaultCountry}" applied.`);
        }
      } else {
        issue("country", "ERROR", "missing_country", "Country is required.", "Fill in the Country cell or set a default country before scanning.");
      }

      // City
      if (text("city")) {
        if (cellOf(sheetInfo, row, "city").type === "n") {
          issue("city", "WARNING", "invalid_type", "City is a number; stored as text.");
        }
        record.city = text("city");
      }

      // Tuition
      const tuitionText = text("annualTuitionFee");
      if (tuitionText) {
        record.annualTuitionFee = tuitionText;
        const numbers = extractNumbers(tuitionText.replace(/\(.*\)/, ""));

        if (OTHER_CURRENCY_RE.test(tuitionText)) {
          issue("annualTuitionFee", "WARNING", "tuition_currency", "Tuition mentions a currency other than EUR; the numeric range is not stored.", "Convert the amount to EUR or leave the note in brackets.");
        } else if (numbers.length === 0) {
          issue("annualTuitionFee", "WARNING", "tuition_unparsed", "Tuition value could not be parsed; saved as text only.", "Use a number or range such as \"0-3000\".");
        } else if (numbers.length >= 2 && numbers[0] > numbers[1]) {
          issue("annualTuitionFee", "ERROR", "tuition_range", "Tuition range is reversed (minimum is larger than maximum).", `Use "${numbers[1]}-${numbers[0]}".`);
        } else {
          record.tuitionFeeMin = numbers[0];
          record.tuitionFeeMax = numbers[1] ?? numbers[0];
        }
      }

      // IELTS
      const ieltsCell = cellOf(sheetInfo, row, "englishRequirement");
      if (ieltsCell?.text) {
        const band = ieltsCell.type === "n" ? Number(ieltsCell.text) : extractNumbers(ieltsCell.text)[0];

        if (ieltsCell.isDate) {
          issue("englishRequirement", "ERROR", "invalid_type", "IELTS cell is formatted as a date.", "Format the cell as a number, e.g. 6.5.");
        } else if (band === undefined || Number.isNaN(band)) {
          issue("englishRequirement", "WARNING", "ielts_unparsed", "IELTS value could not be parsed; saved as text.", "Use a band such as 6.5.");
          record.englishRequirement = ieltsCell.text;
        } else if (band < 0 || band > 9) {
          issue("englishRequirement", "ERROR", "ielts_range", "IELTS must be between 0 and 9.");
        } else {
          if (band * 2 !== Math.round(band * 2)) {
            issue("englishRequirement", "WARNING", "ielts_step", "IELTS bands are normally in steps of 0.5.");
          }
          record.englishRequirement = ieltsCell.text;
        }
      }

      // Requirements / courses
      if (text("requirements")) {
        record.requirements = text("requirements").split(";").map(clean).filter(Boolean);
      }

      if (text("popularCourses")) {
        record.popularCourses = text("popularCourses").split(",").map(clean).filter(Boolean);
      }

      // Application dates
      for (const key of ["applicationOpens", "applicationDeadline"]) {
        const cell = cellOf(sheetInfo, row, key);
        if (!cell?.text) continue;

        if (!cell.isDate) {
          const check = validateDateText(cell.text);
          if (!check.ok) {
            issue(key, check.severity, "invalid_date", check.message, check.suggestion);
            if (check.severity === "ERROR") continue;
          }
        }

        record[key] = cell.text;
      }

      // Recommended %
      const percentText = text("recommendedIndianPercentage");
      if (percentText) {
        const numbers = extractNumbers(percentText);

        if (numbers.length === 0) {
          issue("recommendedIndianPercentage", "WARNING", "percentage_unparsed", "Percentage could not be parsed; saved as text.", "Use a value such as \"75%\" or \"70-80%+\".");
          record.recommendedIndianPercentage = percentText;
        } else if (numbers.some((number) => number > 100)) {
          issue("recommendedIndianPercentage", "ERROR", "percentage_range", "Percentage must be between 0 and 100.");
        } else if (numbers.length >= 2 && numbers[0] > numbers[1]) {
          issue("recommendedIndianPercentage", "ERROR", "percentage_range", "Percentage range is reversed.", `Use "${numbers[1]}-${numbers[0]}%".`);
        } else {
          record.recommendedIndianPercentage = percentText;
        }
      }

      // Website
      const websiteText = text("website");
      if (websiteText) {
        if (isValidUrl(websiteText)) {
          record.website = websiteText;
        } else {
          issue("website", "WARNING", "invalid_url", "Website is not a valid URL; it is not stored on the university (kept in the original row).", /^www\./i.test(websiteText) ? `Use "https://${websiteText}".` : "Use a full URL starting with https://.");
        }
      }

      row.status = rowIssues.includes("ERROR") ? "invalid" : "valid";

      if (row.status === "valid") {
        masterRecords.push({
          sheet: sheetInfo.name,
          rowNumber: row.rowNumber,
          row,
          record,
          key: `${normalizeName(record.name)}|${normalizeName(record.country)}`,
          sourceRow: row.original,
          extraFields: extraFieldsOf(sheetInfo, row),
        });
      }
    }
  }

  // ---------- Duplicates within the file ----------

  const uniqueMasters = [];
  const firstByKey = new Map();

  for (const master of masterRecords) {
    const first = firstByKey.get(master.key);

    if (!first) {
      firstByKey.set(master.key, master);
      master.duplicateRows = [];
      uniqueMasters.push(master);
      continue;
    }

    const identical = JSON.stringify(first.record) === JSON.stringify(master.record);
    master.row.status = "duplicate";
    master.row.action = "Duplicate in file";

    addIssue({
      severity: "WARNING",
      sheet: master.sheet,
      row: master.rowNumber,
      column: "University",
      code: identical ? "duplicate_row" : "duplicate_university",
      message: identical
        ? `Exact duplicate of ${first.sheet} row ${first.rowNumber}; skipped.`
        : `Same university as ${first.sheet} row ${first.rowNumber} with different values. The first row is imported; this row is preserved on the university as a duplicate row.`,
      value: master.record.name,
      suggestion: identical ? "Delete the duplicate row." : "Merge the rows into one.",
    });

    if (!identical) {
      first.duplicateRows.push({ sheet: master.sheet, rowNumber: master.rowNumber, ...master.sourceRow });
    }
  }

  // Similar names in the file that are kept separate (reported, not merged).
  // Each name is compared against the alias keys of the *other* rows.
  const aliasIndex = new Map();
  const aliasKeys = (name) => {
    const { full, base, parens } = nameParts(name);
    return [full, base, ...parens, swappedName(full), swappedName(base)].filter(Boolean);
  };

  for (const master of uniqueMasters) {
    for (const key of aliasKeys(master.record.name)) {
      if (!aliasIndex.has(key)) aliasIndex.set(key, new Set());
      aliasIndex.get(key).add(master.key);
    }
  }

  for (const master of uniqueMasters) {
    const { full, base } = nameParts(master.record.name);
    const similar = new Set();

    [full, base, swappedName(full), swappedName(base)]
      .filter(Boolean)
      .forEach((key) => aliasIndex.get(key)?.forEach((other) => other !== master.key && similar.add(other)));

    for (const otherKey of similar) {
      const other = firstByKey.get(otherKey);
      if (normalizeName(other.record.country) !== normalizeName(master.record.country)) continue;

      addIssue({
        severity: "WARNING",
        sheet: master.sheet,
        row: master.rowNumber,
        column: "University",
        code: "similar_name",
        message: `"${master.record.name}" may be the same university as "${other.record.name}" (${other.sheet} row ${other.rowNumber}). Both are kept as separate universities.`,
        value: master.record.name,
        suggestion: "Use one consistent name if they are the same university.",
      });
    }
  }

  // ---------- Existing universities in MongoDB ----------

  const existingUniversities = await University.find({}, { _id: 1, id: 1, name: 1, country: 1, city: 1 }).lean();

  const matchersByCountry = new Map();
  for (const university of existingUniversities) {
    const countryKey = normalizeName(university.country);
    if (!matchersByCountry.has(countryKey)) matchersByCountry.set(countryKey, []);
    matchersByCountry.get(countryKey).push({ key: String(university._id), name: university.name });
  }
  for (const [countryKey, groups] of matchersByCountry) {
    matchersByCountry.set(countryKey, createNameMatcher(groups));
  }

  const existingById = new Map(existingUniversities.map((university) => [String(university._id), university]));

  // Planned writes, keyed by entity: "db:<_id>" or "file:<name|country>"
  const entities = new Map();

  for (const master of uniqueMasters) {
    const matcher = matchersByCountry.get(normalizeName(master.record.country));
    const result = matcher ? matcher(master.record.name) : { reason: "No matching university" };

    if (result.ambiguous) {
      master.row.status = "invalid";
      addIssue({
        severity: "ERROR",
        sheet: master.sheet,
        row: master.rowNumber,
        column: "University",
        code: "ambiguous_existing",
        message: `Matches more than one existing university (${result.reason.replace("Ambiguous: matches ", "")}).`,
        value: master.record.name,
        suggestion: "Use the exact name of the existing university.",
      });
      continue;
    }

    const existing = result.groupKey ? existingById.get(result.groupKey) : undefined;
    const entityKey = existing ? `db:${existing._id}` : `file:${master.key}`;

    master.entityKey = entityKey;

    entities.set(entityKey, {
      entityKey,
      kind: existing ? "existing" : "new",
      existing,
      master,
      linked: {
        website: undefined,
        ranking: undefined,
        rankingSource: undefined,
        admissionDifficulty: [],
        linkedSheetRows: [],
      },
    });

    if (existing) {
      master.row.action = mode === "update" ? "Update existing" : "Skip (already exists)";
      if (mode !== "update") master.row.status = "skipped";

      addIssue({
        severity: "INFO",
        sheet: master.sheet,
        row: master.rowNumber,
        column: "University",
        code: "already_exists",
        message: `Already exists as "${existing.name}" (${existing.id || existing._id}). ${mode === "update" ? "It will be updated with the non-empty values from this row." : "Skipped; choose \"Update existing\" to overwrite."}`,
        value: master.record.name,
      });
    } else {
      master.row.action = "Create";
    }
  }

  // ======================================================
  // RELATED SHEETS (rankings, websites, admission difficulty)
  // ======================================================

  const linkGroups = [];
  for (const entity of entities.values()) {
    linkGroups.push({ key: entity.entityKey, name: entity.master.record.name });
    if (entity.existing) linkGroups.push({ key: entity.entityKey, name: entity.existing.name });
  }
  for (const university of existingUniversities) {
    const key = `db:${university._id}`;
    if (!entities.has(key)) linkGroups.push({ key, name: university.name });
  }

  const linkMatcher = createNameMatcher(linkGroups);
  const linkedOnlyExisting = new Map();

  const entityFor = (key) => {
    if (entities.has(key)) return entities.get(key);

    if (!linkedOnlyExisting.has(key)) {
      const existing = existingById.get(key.slice(3));
      linkedOnlyExisting.set(key, {
        entityKey: key,
        kind: "existing",
        existing,
        master: undefined,
        linked: { website: undefined, ranking: undefined, rankingSource: undefined, admissionDifficulty: [], linkedSheetRows: [] },
      });
    }

    return linkedOnlyExisting.get(key);
  };

  for (const sheetInfo of sheets.filter((sheet) => ["rankings", "websites", "admissionDifficulty"].includes(sheet.type))) {
    const rankHeader = headerOf(sheetInfo, "rank");
    const rankingSourceFromHeader = rankHeader?.match(/\(([^)]*)\)/)?.[1];

    for (const row of sheetInfo.rows) {
      if (row.status === "header") continue;

      if (sheetInfo.blocked) {
        row.status = "invalid";
        continue;
      }

      const rowIssues = [];
      const issue = (key, severity, code, message, suggestion = "") => {
        rowIssues.push(severity);
        addIssue({
          severity,
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: key ? headerOf(sheetInfo, key) : "",
          code,
          message,
          value: key ? cellOf(sheetInfo, row, key)?.text ?? "" : "",
          suggestion,
        });
      };

      const text = (key) => cellOf(sheetInfo, row, key)?.text ?? "";
      const name = text("name");
      const values = {};

      if (!name) {
        issue("name", "ERROR", "missing_name", "University name is missing.", "Enter the university name or delete the row.");
      }

      if (sheetInfo.type === "rankings") {
        const rank = text("rank").replace(/^[=#]/, "");
        if (!rank) {
          issue("rank", "ERROR", "missing_rank", "Rank is empty.");
        } else if (!/^\d+(\s*[-–]\s*\d+)?\+?$/.test(rank)) {
          issue("rank", "ERROR", "invalid_rank", "Rank must be a whole number or a range such as 201-250.");
        } else {
          values.ranking = rank;
          values.rankingSource = text("rankingSource") || rankingSourceFromHeader || undefined;
        }
      }

      if (sheetInfo.type === "rankings" || sheetInfo.type === "websites") {
        const website = text("website");
        if (website) {
          if (isValidUrl(website)) {
            values.website = website;
          } else {
            issue("website", sheetInfo.type === "websites" ? "ERROR" : "WARNING", "invalid_url", "Website is not a valid URL.", /^www\./i.test(website) ? `Use "https://${website}".` : "Use a full URL starting with https://.");
          }
        } else if (sheetInfo.type === "websites") {
          issue("website", "ERROR", "missing_website", "Official Website is empty.");
        }
      }

      if (sheetInfo.type === "admissionDifficulty") {
        const field = text("field");
        const levelText = text("level");
        const level = DIFFICULTY_LEVELS.find((item) => item.toLowerCase() === levelText.toLowerCase());

        if (!field) issue("field", "ERROR", "missing_field", "Field is empty.");
        if (!levelText) {
          issue("level", "ERROR", "missing_level", "Level is empty.");
        } else if (!level) {
          issue("level", "ERROR", "unsupported_level", `Unsupported level "${levelText}".`, `Use one of: ${DIFFICULTY_LEVELS.join(", ")}.`);
        }

        if (field && level) {
          values.admissionDifficulty = { field, level, sourceName: name, sheet: sheetInfo.name, rowNumber: row.rowNumber };
        }
      }

      if (rowIssues.includes("ERROR")) {
        row.status = "invalid";
        continue;
      }

      const result = linkMatcher(name);

      if (!result.groupKey) {
        row.status = "unlinked";
        row.action = "Not linked";
        addIssue({
          severity: "WARNING",
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: headerOf(sheetInfo, "name"),
          code: result.ambiguous ? "ambiguous_link" : "unlinked",
          message: result.ambiguous
            ? `Cannot be linked safely: ${result.reason.replace("Ambiguous: ", "")}. Not imported (preserved in the import log).`
            : "No university with this name in this file or the database. Not imported (preserved in the import log).",
          value: name,
          suggestion: "Add the university to a University data sheet or use its exact name.",
        });
        continue;
      }

      const entity = entityFor(result.groupKey);
      const linked = entity.linked;
      const targetName = entity.master?.record.name ?? entity.existing?.name;

      const conflict = (label, current, incoming) => {
        addIssue({
          severity: "WARNING",
          sheet: sheetInfo.name,
          row: row.rowNumber,
          column: label,
          code: "conflicting_value",
          message: `${label} for "${targetName}" is already set to "${current}" by another row; "${incoming}" is ignored.`,
          value: incoming,
        });
      };

      if (values.website) {
        const current = linked.website ?? entity.master?.record.website;
        if (current && current !== values.website) conflict("Official Website", current, values.website);
        else linked.website = values.website;
      }

      if (values.ranking) {
        if (linked.ranking && linked.ranking !== values.ranking) conflict("Rank", linked.ranking, values.ranking);
        else {
          linked.ranking = values.ranking;
          linked.rankingSource = values.rankingSource;
        }
      }

      if (values.admissionDifficulty) {
        const current = linked.admissionDifficulty.find((entry) => entry.field === values.admissionDifficulty.field);
        if (current && current.level !== values.admissionDifficulty.level) conflict("Level", current.level, values.admissionDifficulty.level);
        else if (!current) linked.admissionDifficulty.push(values.admissionDifficulty);
      }

      linked.linkedSheetRows.push({ sheet: sheetInfo.name, rowNumber: row.rowNumber, sourceName: name, data: row.original });

      if (entity.kind === "existing" && mode !== "update") {
        row.status = "skipped";
        row.action = `Skip (links to existing "${targetName}")`;
      } else {
        row.status = "valid";
        row.action = entity.kind === "existing" ? `Update existing "${targetName}"` : `Link to "${targetName}"`;
      }
    }
  }

  // Rows on sheets that are not imported
  for (const sheetInfo of sheets) {
    if (["unrecognized", "instructions", "empty"].includes(sheetInfo.type)) {
      sheetInfo.rows.forEach((row) => {
        if (row.status !== "header") {
          row.status = "ignored";
          row.action = sheetInfo.type === "instructions" ? "Instructions" : "Preserved only";
        }
      });
    }
  }

  // ---------- Plan ----------

  const allEntities = [...entities.values(), ...linkedOnlyExisting.values()];

  const creates = allEntities.filter((entity) => entity.kind === "new");
  const updates = mode === "update"
    ? allEntities.filter((entity) => entity.kind === "existing" && entity.existing)
    : [];
  const skippedExisting = mode === "update"
    ? []
    : allEntities.filter((entity) => entity.kind === "existing" && entity.existing);

  const hasFatal = issues.some((issue) => issue.severity === "ERROR" && !issue.row && ["too_many_sheets"].includes(issue.code));

  // ---------- Summary ----------

  const dataRows = sheets.flatMap((sheet) => sheet.rows.filter((row) => row.status !== "header").map((row) => ({ ...row, sheetType: sheet.type })));
  const importableSheetRows = dataRows.filter((row) => !["ignored"].includes(row.status));

  const count = (severity) => issues.filter((issue) => issue.severity === severity).length;

  const summary = {
    sheetsScanned: sheets.length,
    rowsScanned: dataRows.length,
    totalColumns: sheets.reduce((total, sheet) => total + sheet.columnCount, 0),
    validRows: importableSheetRows.filter((row) => row.status === "valid").length,
    invalidRows: importableSheetRows.filter((row) => row.status === "invalid").length,
    skippedRows: importableSheetRows.filter((row) => row.status === "skipped").length,
    duplicateRows: importableSheetRows.filter((row) => row.status === "duplicate").length,
    unlinkedRows: importableSheetRows.filter((row) => row.status === "unlinked").length,
    ignoredRows: dataRows.filter((row) => row.status === "ignored").length,
    universities: {
      new: creates.length,
      alreadyExists: entities.size - creates.length,
      duplicateInFile: masterRecords.length - uniqueMasters.length,
      invalid: sheets
        .filter((sheet) => sheet.type === "universities")
        .flatMap((sheet) => sheet.rows)
        .filter((row) => row.status === "invalid").length,
      linkedExistingOnly: linkedOnlyExisting.size,
    },
    willCreate: creates.length,
    willUpdate: updates.length,
    willSkip: skippedExisting.length,
    errors: count("ERROR"),
    warnings: count("WARNING"),
    infos: count("INFO"),
  };

  const importRowCount = importableSheetRows.filter((row) => row.status === "valid").length;

  const preview = {
    fileName,
    fileSize: buffer.length,
    sha256,
    sheetCount: sheets.length,
    sheetNames: sheets.map((sheet) => sheet.name),
    options: { mode, defaultCountry },
    canImport: !hasFatal && creates.length + updates.length > 0,
    importRowCount,
    summary,
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      type: sheet.type,
      purpose: sheet.purpose,
      headerRowNumber: sheet.headerRowNumber,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      columns: sheet.columns.map(({ index, header, status, mappedTo, mappedHeader, suggestion }) => ({
        index,
        header,
        status,
        ...(mappedTo ? { mappedTo, mappedHeader } : {}),
        ...(suggestion ? { suggestion } : {}),
      })),
      validRows: sheet.rows.filter((row) => row.status === "valid").length,
      invalidRows: sheet.rows.filter((row) => row.status === "invalid").length,
      truncated: sheet.rows.length > LIMITS.previewRowsPerSheet,
      rows: sheet.rows.slice(0, LIMITS.previewRowsPerSheet).map((row) => ({
        rowNumber: row.rowNumber,
        cells: row.texts,
        status: row.status,
        action: row.action,
      })),
    })),
    issues: issues.slice(0, LIMITS.maxIssuesReturned),
    issuesTruncated: issues.length > LIMITS.maxIssuesReturned,
    universities: [
      ...creates.map((entity) => ({
        name: entity.master.record.name,
        country: entity.master.record.country,
        city: entity.master.record.city ?? "",
        action: "create",
        sheet: entity.master.sheet,
        rowNumber: entity.master.rowNumber,
      })),
      ...allEntities
        .filter((entity) => entity.kind === "existing" && entity.existing)
        .map((entity) => ({
          name: entity.existing.name,
          country: entity.existing.country,
          city: entity.existing.city ?? "",
          action: mode === "update" ? "update" : "skip",
          existingId: entity.existing.id || String(entity.existing._id),
          sheet: entity.master?.sheet ?? entity.linked.linkedSheetRows[0]?.sheet ?? "",
          rowNumber: entity.master?.rowNumber ?? entity.linked.linkedSheetRows[0]?.rowNumber ?? null,
        })),
    ],
  };

  return {
    preview,
    plan: { creates, updates, issues, sheets, summary, fileName, sha256, fileSize: buffer.length, mode, defaultCountry },
  };
}

// ======================================================
// IMPORT (WRITES)
// ======================================================

const isTransactionUnsupported = (error) =>
  error?.code === 20 ||
  /Transaction numbers are only allowed|replica set|does not support transactions/i.test(error?.message ?? "");

function buildPreservedRows(plan) {
  const preserved = [];

  for (const sheet of plan.sheets) {
    if (sheet.type === "instructions" || sheet.type === "empty") continue;

    const rows = sheet.rows.filter((row) =>
      ["ignored", "unlinked", "invalid", "duplicate", "skipped"].includes(row.status),
    );

    if (rows.length === 0) continue;

    preserved.push({
      sheet: sheet.name,
      sheetType: sheet.type,
      headers: sheet.headers,
      headerRowNumber: sheet.headerRowNumber,
      rows: rows.map((row) => ({ rowNumber: row.rowNumber, status: row.status, cells: row.texts })),
    });
  }

  // Keep the audit document well below MongoDB's 16 MB limit
  let size = JSON.stringify(preserved).length;
  while (size > 10 * 1024 * 1024 && preserved.length) {
    const largest = preserved.reduce((a, b) => (a.rows.length >= b.rows.length ? a : b));
    largest.rows = largest.rows.slice(0, Math.floor(largest.rows.length / 2));
    largest.truncated = true;
    size = JSON.stringify(preserved).length;
  }

  return preserved;
}

const WRITABLE_MASTER_FIELDS = [
  "name",
  "country",
  "city",
  "annualTuitionFee",
  "tuitionFeeMin",
  "tuitionFeeMax",
  "englishRequirement",
  "requirements",
  "applicationOpens",
  "applicationDeadline",
  "popularCourses",
  "recommendedIndianPercentage",
  "website",
];

const hasValue = (value) =>
  value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);

async function executeImport(plan) {
  const importId = `IMP-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const importedAt = new Date();

  const importSource = (sheet, rowNumber) => ({
    fileName: plan.fileName,
    sheet,
    rowNumber,
    importId,
    importedAt,
  });

  // ---------- New universities ----------

  const stamp = Date.now();

  const createDocs = plan.creates.map((entity, index) => {
    const { master, linked } = entity;
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      id: `UNI-${stamp}-${String(index + 1).padStart(3, "0")}`,
    };

    for (const key of WRITABLE_MASTER_FIELDS) {
      if (hasValue(master.record[key])) doc[key] = master.record[key];
    }

    if (!doc.website && linked.website) doc.website = linked.website;
    if (linked.ranking) doc.ranking = linked.ranking;
    if (linked.rankingSource) doc.rankingSource = linked.rankingSource;
    if (linked.admissionDifficulty.length) doc.admissionDifficulty = linked.admissionDifficulty;
    if (linked.linkedSheetRows.length) doc.linkedSheetRows = linked.linkedSheetRows;

    doc.importSource = importSource(master.sheet, master.rowNumber);
    doc.sourceRow = master.sourceRow;
    if (master.extraFields) doc.extraFields = master.extraFields;
    if (master.duplicateRows.length) doc.duplicateSourceRows = master.duplicateRows;

    return doc;
  });

  // ---------- Updates (only non-empty incoming values; nothing is unset) ----------

  const existingIds = plan.updates.map((entity) => entity.existing._id);
  const snapshots = await University.find({ _id: { $in: existingIds } }).lean();
  const snapshotById = new Map(snapshots.map((doc) => [String(doc._id), doc]));

  const updateOps = plan.updates.map((entity) => {
    const current = snapshotById.get(String(entity.existing._id)) ?? {};
    const { master, linked } = entity;
    const $set = {};

    if (master) {
      for (const key of WRITABLE_MASTER_FIELDS) {
        // Keep the existing name so the record identity does not change
        if (key === "name") continue;
        if (hasValue(master.record[key])) $set[key] = master.record[key];
      }
      $set.sourceRow = master.sourceRow;
      if (master.extraFields) $set.extraFields = { ...(current.extraFields ?? {}), ...master.extraFields };
      if (master.duplicateRows.length) $set.duplicateSourceRows = master.duplicateRows;
      $set.importSource = importSource(master.sheet, master.rowNumber);
    }

    if (linked.website && !$set.website) $set.website = linked.website;
    if (linked.ranking) {
      $set.ranking = linked.ranking;
      if (linked.rankingSource) $set.rankingSource = linked.rankingSource;
    }

    if (linked.admissionDifficulty.length) {
      const incomingFields = new Set(linked.admissionDifficulty.map((entry) => entry.field));
      $set.admissionDifficulty = [
        ...(current.admissionDifficulty ?? []).filter((entry) => !incomingFields.has(entry.field)),
        ...linked.admissionDifficulty,
      ];
    }

    if (linked.linkedSheetRows.length) {
      const seen = new Set(
        (current.linkedSheetRows ?? []).map((row) => `${row.sheet}|${row.rowNumber}|${row.sourceName}`),
      );
      $set.linkedSheetRows = [
        ...(current.linkedSheetRows ?? []),
        ...linked.linkedSheetRows.filter((row) => !seen.has(`${row.sheet}|${row.rowNumber}|${row.sourceName}`)),
      ];
    }

    if (!master) {
      const first = linked.linkedSheetRows[0];
      $set.importSource = importSource(first?.sheet ?? "", first?.rowNumber ?? null);
    }

    return { updateOne: { filter: { _id: entity.existing._id }, update: { $set } } };
  });

  const log = {
    importId,
    fileName: plan.fileName,
    fileSize: plan.fileSize,
    sha256: plan.sha256,
    options: { mode: plan.mode, defaultCountry: plan.defaultCountry },
    summary: plan.summary,
    sheets: plan.sheets.map((sheet) => ({
      name: sheet.name,
      type: sheet.type,
      headerRowNumber: sheet.headerRowNumber,
      headers: sheet.headers,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
    })),
    issues: plan.issues.slice(0, 5000),
    preservedRows: buildPreservedRows(plan),
    createdUniversityIds: createDocs.map((doc) => doc.id),
    updatedUniversityIds: plan.updates.map((entity) => entity.existing.id || String(entity.existing._id)),
  };

  const write = async (session) => {
    if (createDocs.length) {
      await University.insertMany(createDocs, { session, ordered: true });
    }
    if (updateOps.length) {
      await University.bulkWrite(updateOps, { session, ordered: true });
    }
    await ExcelImport.create([log], { session });
  };

  let transactional = true;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(() => write(session));
  } catch (error) {
    if (!isTransactionUnsupported(error)) {
      throw new ImportError(`Import failed and was rolled back; no changes were saved. (${error.message})`, 500);
    }

    // Standalone MongoDB without transactions: write, and undo on failure
    transactional = false;

    try {
      await write(undefined);
    } catch (writeError) {
      await University.deleteMany({ _id: { $in: createDocs.map((doc) => doc._id) } });
      for (const snapshot of snapshots) {
        await University.replaceOne({ _id: snapshot._id }, snapshot);
      }
      await ExcelImport.deleteOne({ importId });

      throw new ImportError(`Import failed and all changes were reverted. (${writeError.message})`, 500);
    }
  } finally {
    await session.endSession();
  }

  const updatedDocs = await University.find(
    { _id: { $in: existingIds } },
    { _id: 0, id: 1, name: 1, country: 1, city: 1 },
  ).lean();

  return {
    importId,
    transactional,
    created: createDocs.map((doc) => ({ id: doc.id, name: doc.name, country: doc.country, city: doc.city ?? "", action: "created" })),
    updated: updatedDocs.map((doc) => ({ id: doc.id, name: doc.name, country: doc.country, city: doc.city ?? "", action: "updated" })),
  };
}

// ======================================================
// TEMPLATE
// ======================================================

function buildTemplate() {
  const workbook = XLSX.utils.book_new();

  const instructions = [
    ["EduPath Navigator - University Excel Import Template"],
    [],
    ["How to use"],
    ["1. Fill the \"Universities\" sheet: one row per university. This sheet creates or updates universities."],
    ["2. Optional sheets link extra data to universities by the University name (exact name, case and punctuation insensitive)."],
    ["3. Related rows can link to universities in the same file or to universities that already exist in the system."],
    ["4. Keep the column names unchanged. Extra columns are allowed and are preserved, but not mapped to university fields."],
    ["5. Upload the file, review the scan and validation results, then confirm the import. Nothing is saved before you confirm."],
    ["6. Leave cells empty when information is not available. Do not enter placeholder values."],
    [],
    ["Sheet", "Column", "Required", "Format / Rules", "Example"],
    ...TEMPLATE_SHEETS.flatMap((sheet) =>
      sheet.columns.map((key) => {
        const column = COLUMN_BY_KEY.get(key);
        const required =
          key === "name" ||
          (sheet.type === "rankings" && key === "rank") ||
          (sheet.type === "websites" && key === "website") ||
          (sheet.type === "admissionDifficulty" && (key === "field" || key === "level"))
            ? "Yes"
            : key === "country"
              ? "Yes (or default country)"
              : "No";

        return [sheet.name, column.header, required, column.description, column.example];
      }),
    ),
  ];

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionsSheet["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 80 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

  for (const sheet of TEMPLATE_SHEETS) {
    const headers = sheet.columns.map((key) => COLUMN_BY_KEY.get(key).header);
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(18, header.length + 6) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

module.exports = {
  LIMITS,
  ImportError,
  analyzeWorkbook,
  executeImport,
  buildTemplate,
};
