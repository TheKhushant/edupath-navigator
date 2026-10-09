import type {
  ExcelColumnSelections,
  ExcelCustomFieldEntity,
  ExcelCustomFieldType,
  ExcelImportField,
  ExcelImportPreview,
  ExcelSheetType,
} from "@/types/crm";

/* =========================================================
   Column include/exclude + target field choices for the
   University / Course Excel import preview. The backend
   re-validates everything; these helpers only build defaults
   and give immediate feedback before the re-scan.
========================================================= */

export type ColumnChoice = { include: boolean; field: string };

/** sheet name -> column index -> choice */
export type SelectionState = Record<string, Record<number, ColumnChoice>>;

/** Target for columns kept as additional info on the record (extraFields). */
export const EXTRA_FIELD = "extraFields";

/** Sheets whose columns can be mapped (others are never imported). */
export const MAPPABLE_SHEET_TYPES: ExcelSheetType[] = [
  "universities",
  "courses",
  "rankings",
  "websites",
  "admissionDifficulty",
  "unrecognized",
];

export const IMPORTED_SHEET_TYPES: ExcelSheetType[] = [
  "universities",
  "courses",
  "rankings",
  "websites",
  "admissionDifficulty",
];

export const columnLabel = (header: string, index: number) => header || `Column ${index + 1}`;

/* ---------- New columns (custom fields) ---------- */

/** Target of a user-defined field: "custom:<key>" -> record.customFields.<key> */
export const CUSTOM_PREFIX = "custom:";

export const CUSTOM_FIELD_TYPES: ExcelCustomFieldType[] = [
  "string",
  "number",
  "boolean",
  "date",
  "array",
  "object",
];

export const CUSTOM_TYPE_LABELS: Record<ExcelCustomFieldType, string> = {
  string: "Text",
  number: "Number",
  boolean: "Yes / No",
  date: "Date",
  array: "List (; or , separated)",
  object: "Object (JSON)",
};

/** Sheet types whose records can have custom fields. */
export const ENTITY_BY_SHEET_TYPE: Partial<Record<ExcelSheetType, ExcelCustomFieldEntity>> = {
  universities: "university",
  courses: "course",
};

/** A column added in the preview. Persisted only with `create` and after the import is confirmed. */
export interface NewColumn {
  id: string;
  entity: ExcelCustomFieldEntity;
  label: string;
  key: string;
  type: ExcelCustomFieldType;
  /** "Create this field in the database" */
  create: boolean;
}

const KEY_RE = /^[a-z][a-zA-Z0-9]{1,39}$/;

/** "Scholarship Amount (EUR)" -> "scholarshipAmountEur" (same rule as the backend). */
export function keyFromLabel(label: string) {
  const words = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  while (words.length && /^[0-9]/.test(words[0] ?? "")) {
    const rest = (words[0] ?? "").replace(/^[0-9]+/, "");
    if (rest) words[0] = rest;
    else words.shift();
  }

  return words
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("")
    .slice(0, 40);
}

export const customRef = (key: string) => `${CUSTOM_PREFIX}${key}`;

/**
 * Immediate feedback for a new column. The backend checks again, including
 * built-in schema fields the browser does not know about.
 */
export function newColumnProblem(
  column: NewColumn,
  all: NewColumn[],
  fields: ExcelImportField[],
): string | undefined {
  if (!column.label.trim()) return "Enter a column name.";
  if (column.label.trim().length > 60) return "Use at most 60 characters.";
  if (!KEY_RE.test(column.key)) return "Use a name that starts with a letter (letters and digits).";

  const key = column.key.toLowerCase();

  if (fields.some((field) => !field.custom && field.key.toLowerCase() === key)) {
    return "This is an existing database field; map the Excel column to it instead.";
  }

  const saved = fields.find(
    (field) =>
      field.custom &&
      !field.custom.isNew &&
      field.custom.entity === column.entity &&
      field.key.slice(CUSTOM_PREFIX.length).toLowerCase() === key,
  );
  if (saved)
    return `A saved field "${saved.label}" already exists; choose it in the field list instead.`;

  if (
    all.some(
      (other) =>
        other.id !== column.id && other.entity === column.entity && other.key.toLowerCase() === key,
    )
  ) {
    return "Another new column has the same name.";
  }

  return undefined;
}

/** Database field a target writes to on this sheet type (course sheets write to UniversityCourse). */
export const dbFieldFor = (field: ExcelImportField, sheetType: ExcelSheetType) =>
  field.dbFields?.[sheetType] ?? field.dbField;

/**
 * Defaults from an automatic scan:
 *  - confidently matched headers: included, mapped automatically;
 *  - headers whose field this sheet type does not import: included as "Additional info";
 *  - duplicate, ambiguous, suggested-only and unknown headers: included but
 *    unmapped, so the user picks a field (or "Additional info") or unchecks them;
 *  - columns without a header: excluded.
 */
export function defaultSelections(preview: ExcelImportPreview): SelectionState {
  const state: SelectionState = {};

  for (const sheet of preview.sheets) {
    if (!MAPPABLE_SHEET_TYPES.includes(sheet.type)) continue;

    const columns: Record<number, ColumnChoice> = {};

    for (const column of sheet.columns) {
      if (column.status === "empty") {
        columns[column.index] = { include: false, field: "" };
      } else if (column.status === "mapped" && column.mappedTo) {
        columns[column.index] = { include: true, field: column.mappedTo };
      } else if (column.status === "unexpected" && column.autoField) {
        columns[column.index] = { include: true, field: EXTRA_FIELD };
      } else {
        columns[column.index] = { include: true, field: "" };
      }
    }

    if (Object.keys(columns).length) state[sheet.name] = columns;
  }

  return state;
}

/**
 * Request payload. New columns are sent only when "Create this field in the
 * database" is ticked and the column is valid; Excel columns mapped to any
 * other new column are sent unmapped, so the server reports them.
 */
export function toPayload(
  state: SelectionState,
  newColumns: NewColumn[] = [],
  fields: ExcelImportField[] = [],
): ExcelColumnSelections {
  const created = newColumns.filter(
    (column) => column.create && !newColumnProblem(column, newColumns, fields),
  );
  const pending = new Set(
    newColumns.filter((column) => !created.includes(column)).map((column) => customRef(column.key)),
  );

  return {
    sheets: Object.entries(state).map(([name, columns]) => ({
      name,
      columns: Object.entries(columns).map(([index, choice]) => ({
        index: Number(index),
        include: choice.include,
        field: choice.include && !pending.has(choice.field) ? choice.field : "",
      })),
    })),
    ...(created.length
      ? {
          customFields: created.map(({ entity, key, label, type }) => ({
            entity,
            key,
            label: label.trim(),
            type,
          })),
        }
      : {}),
  };
}

export const selectionKey = (
  state: SelectionState,
  newColumns: NewColumn[] = [],
  fields: ExcelImportField[] = [],
) => JSON.stringify(toPayload(state, newColumns, fields));

/**
 * Immediate problems per column ("sheet|index" -> message), mirroring the
 * backend rules for sheets that will be imported (they map a University column).
 */
export function mappingProblems(
  state: SelectionState,
  preview: ExcelImportPreview,
  newColumns: NewColumn[] = [],
) {
  const problems = new Map<string, string>();
  const newByRef = new Map(newColumns.map((column) => [customRef(column.key), column]));

  for (const [sheetName, columns] of Object.entries(state)) {
    const sheet = preview.sheets.find((item) => item.name === sheetName);
    const included = Object.entries(columns).filter(([, choice]) => choice.include);

    // Like the backend, mapping is only enforced on sheets that get imported
    if (!included.some(([, choice]) => choice.field === "name")) continue;

    const firstByField = new Map<string, number>();

    for (const [indexText, choice] of included) {
      const index = Number(indexText);

      if (!choice.field) {
        problems.set(`${sheetName}|${index}`, "Select a database field, or uncheck this column.");
        continue;
      }

      if (choice.field === EXTRA_FIELD) continue;

      const newColumn = newByRef.get(choice.field);
      if (newColumn && !newColumn.create) {
        problems.set(
          `${sheetName}|${index}`,
          `Tick "Create this field in the database" for "${newColumn.label}", or choose another field.`,
        );
        continue;
      }
      if (newColumn && newColumnProblem(newColumn, newColumns, preview.fields)) {
        problems.set(`${sheetName}|${index}`, `Fix the new column "${newColumn.label}" first.`);
        continue;
      }

      const first = firstByField.get(choice.field);
      if (first === undefined) {
        firstByField.set(choice.field, index);
      } else {
        const firstLabel = columnLabel(
          sheet?.columns.find((column) => column.index === first)?.header ?? "",
          first,
        );
        problems.set(`${sheetName}|${index}`, `Already mapped from "${firstLabel}".`);
      }
    }
  }

  return problems;
}
