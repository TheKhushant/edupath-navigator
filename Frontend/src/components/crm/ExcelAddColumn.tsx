import { useState } from "react";
import { Database, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ExcelCustomFieldType, ExcelImportField, ExcelSheetPreview } from "@/types/crm";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_TYPE_LABELS,
  ENTITY_BY_SHEET_TYPE,
  columnLabel,
  customRef,
  keyFromLabel,
  newColumnProblem,
  type ColumnChoice,
  type NewColumn,
} from "@/components/crm/excelColumnSelection";

/* =========================================================
   "Add Column" for the Excel import preview: user-defined
   fields that an Excel column can be mapped to. A new column
   becomes a database field (customFields.<key>) only when
   "Create this field in the database" is ticked and the
   import is confirmed.
========================================================= */

const selectClass =
  "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50";

let nextId = 0;
const newId = () => `new-column-${Date.now()}-${++nextId}`;

export function ExcelAddColumn({
  sheet,
  fields,
  newColumns,
  choices,
  creationEnabled,
  onAdd,
  onUpdate,
  onRemove,
  onSetSource,
}: {
  sheet: ExcelSheetPreview;
  fields: ExcelImportField[];
  /** All new columns (every sheet); the ones for this sheet's records are shown. */
  newColumns: NewColumn[];
  choices: Record<number, ColumnChoice>;
  creationEnabled: boolean;
  onAdd: (column: NewColumn, sourceIndex: number | undefined) => void;
  onUpdate: (id: string, patch: Partial<NewColumn>) => void;
  onRemove: (id: string) => void;
  /** Maps the Excel column (or none) to the new column. */
  onSetSource: (column: NewColumn, sourceIndex: number | undefined) => void;
}) {
  const entity = ENTITY_BY_SHEET_TYPE[sheet.type];

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ExcelCustomFieldType>("string");
  const [source, setSource] = useState("");
  const [create, setCreate] = useState(true);

  if (!entity) return null;

  const mine = newColumns.filter((column) => column.entity === entity);
  const excelColumns = sheet.columns.filter((column) => column.header && column.status !== "empty");

  const sourceOf = (column: NewColumn) =>
    Object.entries(choices).find(
      ([, choice]) => choice.include && choice.field === customRef(column.key),
    )?.[0];

  const draft: NewColumn = { id: "draft", entity, label, key: keyFromLabel(label), type, create };
  const draftProblem = label ? newColumnProblem(draft, newColumns, fields) : undefined;

  const add = () => {
    if (!label.trim() || draftProblem) return;
    onAdd(
      { ...draft, id: newId(), label: label.trim() },
      source === "" ? undefined : Number(source),
    );
    setLabel("");
    setType("string");
    setSource("");
    setCreate(true);
    setOpen(false);
  };

  const recordName = entity === "course" ? "course" : "university";

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-line/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs">
          <span className="font-semibold">New columns</span>{" "}
          <span className="text-muted-foreground">
            — fields that do not exist yet, stored on each {recordName} under customFields.
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant={open ? "secondary" : "outline"}
          className="h-8"
          onClick={() => setOpen((value) => !value)}
          disabled={!creationEnabled && !open}
          title={creationEnabled ? undefined : "Creating fields is disabled on the server"}
        >
          <Plus />
          Add Column
        </Button>
      </div>

      {!creationEnabled && (
        <p className="text-xs text-warning-foreground">
          Creating new database fields is disabled on this server. Map columns to existing fields or
          leave them out.
        </p>
      )}

      {open && (
        <div className="grid gap-2 rounded-md bg-secondary/40 p-3 md:grid-cols-[1.4fr_1fr_1.4fr_auto] md:items-end">
          <label className="space-y-1 text-xs">
            <span className="font-medium">Column name</span>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && add()}
              placeholder="e.g. Scholarship Amount"
              maxLength={60}
              className="h-8 text-xs"
              autoFocus
            />
            {label && (
              <span className={draftProblem ? "text-danger-foreground" : "text-muted-foreground"}>
                {draftProblem ?? `Stored as customFields.${draft.key}`}
              </span>
            )}
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-medium">Data type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ExcelCustomFieldType)}
              className={`${selectClass} w-full`}
            >
              {CUSTOM_FIELD_TYPES.map((item) => (
                <option key={item} value={item}>
                  {CUSTOM_TYPE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-medium">Values from Excel column</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="">Choose later</option>
              {excelColumns.map((column) => (
                <option key={column.index} value={column.index}>
                  {columnLabel(column.header, column.index)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={create}
                onCheckedChange={(checked) => setCreate(checked === true)}
              />
              Create this field in the database
            </label>
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={add}
              disabled={!label.trim() || Boolean(draftProblem)}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">Values from</th>
                <th className="px-2 py-1 font-medium">Database</th>
                <th className="w-10 px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {mine.map((column) => {
                const problem = newColumnProblem(column, newColumns, fields);
                const sourceIndex = sourceOf(column);

                return (
                  <tr key={column.id} className="align-top">
                    <td className="px-2 py-1.5">
                      <Input
                        value={column.label}
                        aria-label="Rename new column"
                        maxLength={60}
                        className="h-8 text-xs"
                        onChange={(event) =>
                          onUpdate(column.id, {
                            label: event.target.value,
                            key: keyFromLabel(event.target.value),
                          })
                        }
                      />
                      <p
                        className={`mt-1 ${problem ? "text-danger-foreground" : "text-muted-foreground"}`}
                      >
                        {problem ?? `customFields.${column.key}`}
                      </p>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={column.type}
                        aria-label="Data type"
                        onChange={(event) =>
                          onUpdate(column.id, { type: event.target.value as ExcelCustomFieldType })
                        }
                        className={selectClass}
                      >
                        {CUSTOM_FIELD_TYPES.map((item) => (
                          <option key={item} value={item}>
                            {CUSTOM_TYPE_LABELS[item]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={sourceIndex ?? ""}
                        aria-label="Excel column for this field"
                        onChange={(event) =>
                          onSetSource(
                            column,
                            event.target.value === "" ? undefined : Number(event.target.value),
                          )
                        }
                        className={`${selectClass} ${sourceIndex === undefined && column.create ? "border-danger/50" : ""}`}
                      >
                        <option value="">No Excel column</option>
                        {excelColumns.map((excelColumn) => (
                          <option key={excelColumn.index} value={excelColumn.index}>
                            {columnLabel(excelColumn.header, excelColumn.index)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={column.create}
                          disabled={!creationEnabled}
                          onCheckedChange={(checked) =>
                            onUpdate(column.id, { create: checked === true })
                          }
                        />
                        Create this field in the database
                      </label>
                      {column.create ? (
                        <Badge
                          variant="outline"
                          className="mt-1 gap-1 border-brand/30 bg-brand/10 text-brand"
                        >
                          <Database className="h-3 w-3" /> Created on import
                        </Badge>
                      ) : (
                        <p className="mt-1 text-muted-foreground">Preview only; not saved.</p>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Remove ${column.label}`}
                        onClick={() => onRemove(column.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
