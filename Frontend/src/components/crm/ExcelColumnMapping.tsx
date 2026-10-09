import { ArrowRight, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  ExcelColumnInfo,
  ExcelImportField,
  ExcelImportPreview,
  ExcelMatchConfidence,
  ExcelSheetPreview,
} from "@/types/crm";
import {
  EXTRA_FIELD,
  IMPORTED_SHEET_TYPES,
  MAPPABLE_SHEET_TYPES,
  columnLabel,
  dbFieldFor,
  CUSTOM_TYPE_LABELS,
  ENTITY_BY_SHEET_TYPE,
  customRef,
  type ColumnChoice,
  type NewColumn,
} from "@/components/crm/excelColumnSelection";

/* =========================================================
   Column include/exclude and target-field mapping for one
   sheet of the University / Course Excel import preview.
========================================================= */

const selectClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50";

const CONFIDENCE: Record<ExcelMatchConfidence, { label: string; className: string }> = {
  high: { label: "High", className: "border-success/25 bg-success/10 text-success-foreground" },
  medium: { label: "Medium", className: "border-warning/30 bg-warning/20 text-warning-foreground" },
  low: { label: "Low", className: "border-danger/25 bg-danger/10 text-danger-foreground" },
};

function ConfidenceBadge({ column }: { column: ExcelColumnInfo }) {
  if (!column.confidence) {
    return <span className="text-muted-foreground">No match</span>;
  }

  const { label, className } = CONFIDENCE[column.confidence];

  return (
    <div className="space-y-1">
      <Badge variant="outline" className={className} title={column.matchReason}>
        {label}
      </Badge>
      {column.matchReason && (
        <p className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
          {column.matchReason}
        </p>
      )}
    </div>
  );
}

export function ColumnMappingTable({
  sheet,
  fields,
  choices,
  problems,
  onChange,
  newColumns = [],
}: {
  sheet: ExcelSheetPreview;
  fields: ExcelImportField[];
  choices: Record<number, ColumnChoice>;
  /** "sheet|index" -> message */
  problems: Map<string, string>;
  onChange: (index: number, choice: ColumnChoice) => void;
  /** Columns added in the preview (custom fields not saved yet). */
  newColumns?: NewColumn[];
}) {
  const columns = sheet.columns.filter((column) => choices[column.index]);
  if (!columns.length) return null;

  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const fieldLabel = (field: ExcelImportField) =>
    `${field.label} → ${dbFieldFor(field, sheet.type)}`;

  // Core fields; custom fields are listed in their own groups below
  const dataFields = fields.filter((field) => field.key !== EXTRA_FIELD && !field.custom);
  const extra = fieldByKey.get(EXTRA_FIELD);
  const usedHere = dataFields.filter((field) => field.sheetTypes.includes(sheet.type));
  const others = dataFields.filter((field) => !field.sheetTypes.includes(sheet.type));

  const entity = ENTITY_BY_SHEET_TYPE[sheet.type];
  const newHere = newColumns.filter((column) => column.entity === entity);
  const newRefs = new Set(newHere.map((column) => customRef(column.key)));
  const savedCustom = fields.filter(
    (field) =>
      field.custom &&
      field.custom.entity === entity &&
      !newRefs.has(field.key) &&
      !field.custom.isNew,
  );
  const allIncluded = columns.every((column) => choices[column.index]?.include);

  // A database field can be filled from one column only
  const usedByField = new Map<string, { index: number; label: string }>();
  for (const column of columns) {
    const choice = choices[column.index];
    if (!choice?.include || !choice.field || choice.field === EXTRA_FIELD) continue;
    if (!usedByField.has(choice.field)) {
      usedByField.set(choice.field, {
        index: column.index,
        label: columnLabel(column.header, column.index),
      });
    }
  }

  const included = columns.filter((column) => choices[column.index]?.include);
  const unmatched = included.filter((column) => !choices[column.index]?.field).length;
  const toReview = included.filter(
    (column) =>
      choices[column.index]?.field &&
      choices[column.index]?.field === column.autoField &&
      column.confidence === "medium",
  ).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">
          {included.length} of {columns.length} columns selected
        </Badge>
        {unmatched > 0 && (
          <Badge variant="outline" className={CONFIDENCE.low.className}>
            {unmatched} unmatched: choose a field or uncheck
          </Badge>
        )}
        {toReview > 0 && (
          <Badge variant="outline" className={CONFIDENCE.medium.className}>
            {toReview} matched with medium confidence: please check
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line/60">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allIncluded}
                  aria-label="Include all columns"
                  onCheckedChange={(checked) =>
                    columns.forEach((column) => {
                      const choice = choices[column.index];
                      if (choice) onChange(column.index, { ...choice, include: checked === true });
                    })
                  }
                />
              </th>
              <th className="px-3 py-2 font-medium">Excel column</th>
              <th className="px-3 py-2 font-medium">Sample values</th>
              <th className="w-[300px] px-3 py-2 font-medium">Database field</th>
              <th className="w-[160px] px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {columns.map((column) => {
              const choice = choices[column.index] ?? { include: false, field: "" };
              const problem = problems.get(`${sheet.name}|${column.index}`);
              // Name of another column that already uses this field
              const takenBy = (key: string) => {
                const owner = usedByField.get(key);
                return owner && owner.index !== column.index ? owner.label : undefined;
              };
              const option = (key: string, text: string) => (
                <option key={key} value={key} disabled={Boolean(takenBy(key))}>
                  {takenBy(key) ? `${text} — used by "${takenBy(key)}"` : text}
                </option>
              );
              const options = (
                column.candidates?.length ? column.candidates : [column.suggestionField]
              )
                .map((key) => (key ? fieldByKey.get(key) : undefined))
                .filter((field): field is ExcelImportField => Boolean(field))
                .filter((field) => !takenBy(field.key));

              return (
                <tr
                  key={column.index}
                  className={`align-top ${choice.include ? "" : "bg-secondary/30 text-muted-foreground"}`}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={choice.include}
                      aria-label={`Include ${columnLabel(column.header, column.index)}`}
                      onCheckedChange={(checked) =>
                        onChange(column.index, { ...choice, include: checked === true })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <span className={choice.include ? "" : "line-through"}>
                      {column.header || (
                        <em className="text-muted-foreground">
                          No header ({columnLabel("", column.index)})
                        </em>
                      )}
                    </span>
                  </td>
                  <td className="max-w-[240px] px-3 py-2 text-muted-foreground">
                    {column.samples?.length ? (
                      <ul className="space-y-0.5">
                        {column.samples.map((sample, index) => (
                          <li key={index} className="line-clamp-1" title={sample}>
                            {sample}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={choice.field}
                      disabled={!choice.include}
                      aria-label={`Database field for ${columnLabel(column.header, column.index)}`}
                      onChange={(event) =>
                        onChange(column.index, { ...choice, field: event.target.value })
                      }
                      className={`${selectClass} ${choice.include && !choice.field ? "border-danger/50" : ""}`}
                    >
                      <option value="">Select database field…</option>
                      {usedHere.length > 0 ? (
                        <>
                          <optgroup label="Imported on this sheet">
                            {usedHere.map((field) => option(field.key, fieldLabel(field)))}
                          </optgroup>
                          <optgroup label="Other sheet types">
                            {others.map((field) => option(field.key, fieldLabel(field)))}
                          </optgroup>
                        </>
                      ) : (
                        dataFields.map((field) => option(field.key, fieldLabel(field)))
                      )}
                      {savedCustom.length > 0 && (
                        <optgroup label="Custom fields (saved by earlier imports)">
                          {savedCustom.map((field) =>
                            option(
                              field.key,
                              `${field.label} (${field.custom ? CUSTOM_TYPE_LABELS[field.custom.type] : ""}) → ${dbFieldFor(field, sheet.type)}`,
                            ),
                          )}
                        </optgroup>
                      )}
                      {newHere.length > 0 && (
                        <optgroup label="New columns (this import)">
                          {newHere.map((column) =>
                            option(
                              customRef(column.key),
                              `${column.label || "(unnamed)"} (new, ${CUSTOM_TYPE_LABELS[column.type]})${column.create ? "" : " — not created"}`,
                            ),
                          )}
                        </optgroup>
                      )}
                      {extra && <option value={extra.key}>{fieldLabel(extra)}</option>}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <ConfidenceBadge column={column} />
                  </td>
                  <td className="px-3 py-2">
                    {!choice.include ? (
                      <span>Not imported</span>
                    ) : problem ? (
                      <span className="font-medium text-danger-foreground">{problem}</span>
                    ) : choice.field === EXTRA_FIELD ? (
                      <Badge variant="outline">Additional info</Badge>
                    ) : choice.field && choice.field === column.autoField ? (
                      <Badge
                        variant="outline"
                        className={
                          column.confidence === "medium"
                            ? CONFIDENCE.medium.className
                            : CONFIDENCE.high.className
                        }
                      >
                        {column.confidence === "medium" ? "Auto-mapped, check" : "Auto-mapped"}
                      </Badge>
                    ) : choice.field ? (
                      <Badge variant="outline" className="border-brand/30 bg-brand/10 text-brand">
                        Manual
                      </Badge>
                    ) : (
                      <span className="text-warning-foreground">
                        {column.candidates?.length ? "Ambiguous: choose a field" : "Needs mapping"}
                      </span>
                    )}
                    {choice.include &&
                      !choice.field &&
                      options.map((field) => (
                        <button
                          key={field.key}
                          type="button"
                          onClick={() => onChange(column.index, { ...choice, field: field.key })}
                          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                        >
                          <Wand2 className="h-3 w-3" /> Use "{field.label}"
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * "Excel Header → Database Field" for the last scan (server result), so the
 * user sees exactly where every selected column goes before confirming.
 */
export function MappingSummary({ preview }: { preview: ExcelImportPreview }) {
  const byKey = new Map(preview.fields.map((field) => [field.key, field]));
  const sheets = preview.sheets.filter(
    (sheet) =>
      MAPPABLE_SHEET_TYPES.includes(sheet.type) && sheet.columns.some((column) => column.selected),
  );

  if (!sheets.length) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sheets.map((sheet) => {
        const imported = IMPORTED_SHEET_TYPES.includes(sheet.type);
        const included = sheet.columns.filter(
          (column) => column.selected && column.status !== "excluded",
        );
        const excluded = sheet.columns.filter((column) => column.status === "excluded");

        return (
          <div key={sheet.name} className="rounded-lg border border-line/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{sheet.name}</p>
              <Badge variant="outline" className={imported ? "" : "text-muted-foreground"}>
                {imported ? sheet.purpose : "Not imported"}
              </Badge>
            </div>

            {imported ? (
              <ul className="grid gap-1 text-xs">
                {included.map((column) => {
                  const target =
                    column.status === "mapped" && column.mappedTo
                      ? byKey.get(column.mappedTo)
                      : column.status === "unexpected"
                        ? byKey.get(EXTRA_FIELD)
                        : undefined;

                  return (
                    <li key={column.index} className="flex items-center gap-2">
                      <span className="min-w-0 truncate font-medium">
                        {columnLabel(column.header, column.index)}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      {target ? (
                        <span className="min-w-0 truncate">
                          {target.label}{" "}
                          <code className="rounded bg-secondary px-1 text-[10px]">
                            {dbFieldFor(target, sheet.type)}
                          </code>
                        </span>
                      ) : (
                        <span className="font-medium text-danger-foreground">
                          {column.status === "duplicate" ? "Mapped twice" : "Not mapped"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                This sheet has no University column mapping, so nothing on it is imported.
              </p>
            )}

            {excluded.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Not imported:{" "}
                {excluded.map((column) => columnLabel(column.header, column.index)).join(", ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
