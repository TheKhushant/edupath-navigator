const XLSX = require("xlsx");

// ======================================================
// CUSTOM FIELDS (user-defined fields added during an Excel import)
//
// Values are stored in a record's `customFields` object, never as new
// top-level schema paths, so core University / UniversityCourse fields
// cannot be changed or shadowed. Definitions (entity, key, label, type)
// are stored in CustomFieldDefinition.
// ======================================================

const CUSTOM_FIELD_TYPES = ["string", "number", "boolean", "date", "array", "object"];

const ENTITIES = ["university", "course"];

// camelCase ASCII: no dots, "$", spaces or prototype tricks
const KEY_RE = /^[a-z][a-zA-Z0-9]{1,39}$/;

const MAX_LABEL_LENGTH = 60;
const MAX_FIELDS_PER_ENTITY = 50;
const MAX_NEW_FIELDS_PER_IMPORT = 20;
const MAX_ARRAY_ITEMS = 100;
const MAX_TEXT_LENGTH = 2000;
const MAX_OBJECT_DEPTH = 3;
const MAX_OBJECT_KEYS = 50;

// Never usable as keys, whatever the schema contains
const ALWAYS_RESERVED = [
  "id", "_id", "__v", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty",
  "customFields", "extraFields", "sourceRow", "searchTags", "createdAt", "updatedAt",
];

/** Field creation can be switched off on the server (there is no per-user auth in this app). */
const creationEnabled = () =>
  !/^(0|false|off|no|disabled)$/i.test(String(process.env.EXCEL_IMPORT_CUSTOM_FIELDS ?? "").trim());

/** "Scholarship Amount (EUR)" -> "scholarshipAmountEur" */
function keyFromLabel(label) {
  const words = String(label ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  // A key must start with a letter: leading numbers ("2024 Intake") are dropped
  while (words.length && /^[0-9]/.test(words[0])) {
    const rest = words[0].replace(/^[0-9]+/, "");
    if (rest) words[0] = rest;
    else words.shift();
  }

  const key = words
    .map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join("");

  return key.slice(0, 40);
}

/** Top-level paths of a Mongoose model plus extra reserved names, lower-cased. */
function reservedKeysFor(Model, extra = []) {
  const paths = Object.keys(Model.schema.paths).map((path) => path.split(".")[0]);
  const virtuals = Object.keys(Model.schema.virtuals ?? {});
  return new Set([...paths, ...virtuals, ...ALWAYS_RESERVED, ...extra].map((key) => key.toLowerCase()));
}

const hasControlChars = (text) =>
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F]/.test(text);

/**
 * Validates one new definition { entity, key, label, type }.
 * Returns an error message, or undefined when valid.
 */
function definitionError(definition, reserved) {
  if (!definition || typeof definition !== "object") return "Each custom field must be an object.";

  const { entity, key, label, type } = definition;

  if (!ENTITIES.includes(entity)) return `Custom field "${key}": entity must be one of ${ENTITIES.join(", ")}.`;
  if (typeof label !== "string" || !label.trim()) return "Custom field name is required.";
  if (label.trim().length > MAX_LABEL_LENGTH) return `Custom field name "${label}" is longer than ${MAX_LABEL_LENGTH} characters.`;
  if (hasControlChars(label)) return `Custom field name "${label}" contains invalid characters.`;
  if (typeof key !== "string" || !KEY_RE.test(key)) {
    return `Custom field "${label}": key "${String(key)}" must be 2-40 letters/digits in camelCase, starting with a lower-case letter.`;
  }
  if (reserved[entity].has(key.toLowerCase())) {
    return `Custom field "${label}": "${key}" is a built-in ${entity} field and cannot be created as a custom field. Map the column to the existing field instead.`;
  }
  if (!CUSTOM_FIELD_TYPES.includes(type)) return `Custom field "${label}": type must be one of ${CUSTOM_FIELD_TYPES.join(", ")}.`;

  return undefined;
}

// ---------- Values ----------

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) &&
  Object.getPrototypeOf(value) === Object.prototype;

const SAFE_OBJECT_KEY_RE = /^[A-Za-z0-9 _-]{1,60}$/;

/** JSON object safe to store: no "$" / "." keys, limited depth, size and key count. */
function isSafeObject(value, depth = 1) {
  if (!isPlainObject(value) || depth > MAX_OBJECT_DEPTH) return false;

  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) return false;

  return entries.every(([key, item]) => {
    if (!SAFE_OBJECT_KEY_RE.test(key)) return false;
    if (item === null || ["string", "number", "boolean"].includes(typeof item)) {
      return typeof item !== "number" || Number.isFinite(item);
    }
    if (Array.isArray(item)) {
      return item.length <= MAX_ARRAY_ITEMS && item.every((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry));
    }
    return isSafeObject(item, depth + 1);
  });
}

const NUMBER_RE = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
const TRUE_RE = /^(true|yes|y|1)$/i;
const FALSE_RE = /^(false|no|n|0)$/i;

function dateFromText(text) {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!iso && !dmy) return undefined;

  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : undefined;
}

/**
 * Excel cell ({ text, type, isDate, serial }) -> typed value.
 * Returns { value } or { error, suggestion }.
 */
function convertCell(type, cell) {
  const text = String(cell?.text ?? "").trim();

  switch (type) {
    case "string":
      return { value: text.slice(0, MAX_TEXT_LENGTH) };

    case "number": {
      const compact = text.replace(/\s/g, "");
      if (!NUMBER_RE.test(compact)) return { error: `"${text}" is not a number.`, suggestion: "Use digits only, e.g. 1500 or 1,500.50." };
      const number = Number(compact.replace(/,/g, ""));
      return Number.isFinite(number) ? { value: number } : { error: `"${text}" is not a number.` };
    }

    case "boolean":
      if (cell?.type === "b") return { value: /^true$/i.test(text) };
      if (TRUE_RE.test(text)) return { value: true };
      if (FALSE_RE.test(text)) return { value: false };
      return { error: `"${text}" is not a yes/no value.`, suggestion: "Use Yes/No, True/False or 1/0." };

    case "date": {
      if (cell?.isDate && typeof cell.serial === "number") {
        const parts = XLSX.SSF.parse_date_code(cell.serial);
        if (parts?.y) return { value: new Date(Date.UTC(parts.y, parts.m - 1, parts.d)) };
      }
      const date = dateFromText(text);
      return date
        ? { value: date }
        : { error: `"${text}" is not a date.`, suggestion: "Use a date cell, YYYY-MM-DD or DD/MM/YYYY." };
    }

    case "array": {
      const items = text.split(text.includes(";") ? ";" : ",").map((item) => item.trim()).filter(Boolean);
      return items.length <= MAX_ARRAY_ITEMS
        ? { value: items }
        : { error: `More than ${MAX_ARRAY_ITEMS} items.` };
    }

    case "object": {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { error: "Not valid JSON.", suggestion: "Use a JSON object such as {\"amount\": 500, \"currency\": \"EUR\"}." };
      }
      return isSafeObject(parsed)
        ? { value: parsed }
        : {
            error: "JSON must be an object with simple keys (letters, digits, space, _ or -), at most 3 levels deep.",
            suggestion: "Remove keys with \"$\" or \".\" and nested arrays of objects.",
          };
    }

    default:
      return { error: `Unsupported type "${type}".` };
  }
}

/** Schema-level guard for a record's customFields object. */
function isValidCustomFields(value) {
  if (value === undefined || value === null) return true;
  if (!isPlainObject(value)) return false;

  const entries = Object.entries(value);
  if (entries.length > 200) return false;

  return entries.every(([key, item]) => {
    if (!KEY_RE.test(key)) return false;
    if (item === null || typeof item === "boolean" || item instanceof Date) return true;
    if (typeof item === "string") return item.length <= MAX_TEXT_LENGTH;
    if (typeof item === "number") return Number.isFinite(item);
    if (Array.isArray(item)) return item.length <= MAX_ARRAY_ITEMS && item.every((entry) => typeof entry === "string" && entry.length <= MAX_TEXT_LENGTH);
    return isSafeObject(item);
  });
}

module.exports = {
  CUSTOM_FIELD_TYPES,
  ENTITIES,
  KEY_RE,
  MAX_FIELDS_PER_ENTITY,
  MAX_NEW_FIELDS_PER_IMPORT,
  creationEnabled,
  keyFromLabel,
  reservedKeysFor,
  definitionError,
  convertCell,
  isValidCustomFields,
};
