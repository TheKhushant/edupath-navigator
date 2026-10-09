import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { universityImportService } from "@/services/crmServices";
import { ColumnMappingTable, MappingSummary } from "@/components/crm/ExcelColumnMapping";
import { ExcelAddColumn } from "@/components/crm/ExcelAddColumn";
import {
  ExcelImportProgressPanel,
  type TrackedProgress,
} from "@/components/crm/ExcelImportProgressPanel";
import { fitColumnWidths, isUrlLike, tableWidth } from "@/components/crm/excelTableLayout";
import {
  CUSTOM_TYPE_LABELS,
  ENTITY_BY_SHEET_TYPE,
  customRef,
  defaultSelections,
  mappingProblems,
  newColumnProblem,
  selectionKey,
  toPayload,
  type ColumnChoice,
  type NewColumn,
  type SelectionState,
} from "@/components/crm/excelColumnSelection";
import type {
  ExcelImportMode,
  ExcelImportPreview,
  ExcelImportResult,
  ExcelIssueSeverity,
  ExcelRowStatus,
  ExcelSheetPreview,
} from "@/types/crm";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls"];

type Step = "select" | "scanning" | "preview" | "importing" | "result";

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function severityClass(severity: ExcelIssueSeverity) {
  switch (severity) {
    case "ERROR":
      return "bg-danger/15 text-danger-foreground border-danger/25";
    case "WARNING":
      return "bg-warning/20 text-warning-foreground border-warning/30";
    default:
      return "bg-info/15 text-info-foreground border-info/25";
  }
}

function rowStatusClass(status: ExcelRowStatus) {
  switch (status) {
    case "valid":
      return "bg-success/15 text-success-foreground border-success/25";
    case "invalid":
      return "bg-danger/15 text-danger-foreground border-danger/25";
    case "duplicate":
    case "unlinked":
      return "bg-warning/20 text-warning-foreground border-warning/30";
    default:
      return "bg-secondary text-muted-foreground border-border";
  }
}

function SeverityIcon({ severity }: { severity: ExcelIssueSeverity }) {
  if (severity === "ERROR") return <XCircle className="h-3.5 w-3.5" />;
  if (severity === "WARNING") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-secondary/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

const ROW_BATCH = 100;
// Fixed "Row" and "Status" columns
const ROW_COLUMN_PX = 64;
const STATUS_COLUMN_PX = 170;

function SheetPanel({
  sheet,
  mapping,
  addColumn,
  newColumns = [],
  choices = {},
}: {
  sheet: ExcelSheetPreview;
  mapping?: React.ReactNode;
  addColumn?: React.ReactNode;
  /** New columns of this sheet's records, shown with the values of their Excel column. */
  newColumns?: NewColumn[];
  choices?: Record<number, ColumnChoice>;
}) {
  const columnCount = Math.max(sheet.columnCount, sheet.columns.length);

  // New columns that take their values from an Excel column of this sheet
  const added = newColumns
    .map((column) => ({
      column,
      source: Object.entries(choices).find(
        ([, choice]) => choice.include && choice.field === customRef(column.key),
      )?.[0],
    }))
    .filter((item): item is { column: NewColumn; source: string } => item.source !== undefined);

  const headers = [
    ...Array.from(
      { length: columnCount },
      (_, index) => sheet.columns[index]?.header || `Column ${index + 1}`,
    ),
    ...added.map(({ column }) => `${column.label} (new)`),
  ];
  const cellsOf = (cells: string[]) => [
    ...Array.from({ length: columnCount }, (_, index) => cells[index] ?? ""),
    ...added.map(({ source }) => cells[Number(source)] ?? ""),
  ];

  // Recalculated when the file (sheet), the mapping or the new columns change
  const widths = useMemo(
    () =>
      fitColumnWidths(
        headers,
        sheet.rows.map((row) => cellsOf(row.cells)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, headers.join("\u0000"), added.map(({ source }) => source).join(",")],
  );

  // Rows are rendered in batches so large previews stay responsive
  const [visible, setVisible] = useState(ROW_BATCH);
  useEffect(() => setVisible(ROW_BATCH), [sheet]);
  const rows = sheet.rows.slice(0, visible);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{sheet.purpose}</Badge>
        <span className="text-muted-foreground">
          {sheet.rowCount} rows · {sheet.columnCount} columns
          {sheet.headerRowNumber ? ` · headers on row ${sheet.headerRowNumber}` : ""}
        </span>
        <Badge variant="outline" className={rowStatusClass("valid")}>
          {sheet.validRows} valid
        </Badge>
        <Badge variant="outline" className={rowStatusClass("invalid")}>
          {sheet.invalidRows} invalid
        </Badge>
      </div>

      {addColumn}

      {mapping && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">
            Columns and database fields{" "}
            <span className="font-normal text-muted-foreground">
              — uncheck a column to leave it out; pick a field for columns that are not mapped
              automatically.
            </span>
          </p>
          {mapping}
        </div>
      )}

      {!mapping && sheet.columns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sheet.columns
            .filter((column) => column.status !== "empty")
            .map((column) => (
              <Badge
                key={column.index}
                variant="outline"
                title={
                  column.status === "mapped"
                    ? `Mapped to ${column.mappedHeader}`
                    : column.status === "suggested"
                      ? `Not mapped. Did you mean "${column.suggestion}"?`
                      : column.status === "duplicate"
                        ? "Duplicate column"
                        : "Not a template column; preserved"
                }
                className={
                  column.status === "mapped"
                    ? "bg-success/10 text-success-foreground border-success/25"
                    : column.status === "suggested" || column.status === "duplicate"
                      ? "bg-warning/20 text-warning-foreground border-warning/30"
                      : "text-muted-foreground"
                }
              >
                {column.header}
                {column.status === "suggested" && ` → ${column.suggestion}?`}
              </Badge>
            ))}
        </div>
      )}

      {sheet.rows.length > 0 ? (
        <div className="max-h-[380px] max-w-full overflow-auto rounded-lg border border-line/60">
          <table
            className="table-fixed text-left text-xs"
            style={{ width: tableWidth(widths, ROW_COLUMN_PX + STATUS_COLUMN_PX) }}
          >
            <colgroup>
              <col style={{ width: ROW_COLUMN_PX }} />
              <col style={{ width: STATUS_COLUMN_PX }} />
              {widths.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    className={`px-3 py-2 font-medium ${
                      sheet.columns[index]?.status === "excluded" ? "line-through opacity-50" : ""
                    } ${index >= columnCount ? "text-brand" : ""}`}
                    title={
                      sheet.columns[index]?.status === "excluded"
                        ? "Not imported"
                        : index >= columnCount
                          ? "New column: values of the mapped Excel column"
                          : header
                    }
                  >
                    <span className="line-clamp-2 break-words">{header}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row) => (
                <tr key={row.rowNumber} className="align-top hover:bg-accent/40">
                  <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={rowStatusClass(row.status)}
                      title={row.action || undefined}
                    >
                      {row.status === "header" ? "header row" : row.status}
                    </Badge>
                    {row.action && (
                      <p className="mt-1 max-w-[160px] text-[10px] text-muted-foreground">
                        {row.action}
                      </p>
                    )}
                  </td>
                  {cellsOf(row.cells).map((value, index) => (
                    <td key={index} className="px-3 py-2">
                      <span
                        className={`line-clamp-3 ${isUrlLike(value) ? "break-all" : "break-words"}`}
                        title={value.length > 40 ? value : undefined}
                      >
                        {value}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line/60 p-6 text-center text-sm text-muted-foreground">
          No data rows in this sheet.
        </p>
      )}

      {sheet.rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {rows.length} of {sheet.rows.length} preview rows
            {sheet.truncated
              ? ` (the sheet has ${sheet.rowCount} rows; all of them are validated and imported)`
              : ""}
            .
          </span>
          {visible < sheet.rows.length && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setVisible((count) => count + ROW_BATCH)}
            >
              Show {Math.min(ROW_BATCH, sheet.rows.length - visible)} more rows
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function UniversityImport({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [mode, setMode] = useState<ExcelImportMode>("skip");
  const [defaultCountry, setDefaultCountry] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [result, setResult] = useState<ExcelImportResult | null>(null);

  const [activeSheet, setActiveSheet] = useState("");

  // Column include/exclude + target field; the backend applies them on scan and import
  const [selections, setSelections] = useState<SelectionState>({});
  const [scannedKey, setScannedKey] = useState("");
  // Columns added in the preview (custom fields)
  const [newColumns, setNewColumns] = useState<NewColumn[]>([]);
  const [confirmCustomFields, setConfirmCustomFields] = useState(false);
  const [progress, setProgress] = useState<TrackedProgress | null>(null);
  const [severityFilter, setSeverityFilter] = useState<ExcelIssueSeverity | "ALL">("ALL");
  const [sheetFilter, setSheetFilter] = useState("ALL");

  const reset = () => {
    setStep("select");
    setFile(null);
    setError(null);
    setPreview(null);
    setResult(null);
    setMode("skip");
    setDefaultCountry("");
    setConfirmOverwrite(false);
    setSeverityFilter("ALL");
    setSheetFilter("ALL");
    setSelections({});
    setScannedKey("");
    setNewColumns([]);
    setConfirmCustomFields(false);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const downloadTemplate = async () => {
    setDownloading(true);

    try {
      const blob = await universityImportService.downloadTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "university-import-template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      alert(errorMessage(downloadError, "Failed to download the template"));
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Runs one preview/import request while showing its progress: upload percent
   * from the browser, phases and row counts polled from the server.
   */
  const tracked = async <T,>(
    request: TrackedProgress["request"],
    label: string,
    run: (options: {
      progressId: string;
      onUploadProgress: (percent: number) => void;
    }) => Promise<T>,
  ): Promise<T> => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

    const patch = (update: (current: TrackedProgress) => TrackedProgress) =>
      setProgress((current) => (current?.id === id ? update(current) : current));

    setProgress({ id, request, label, upload: 0, server: null, rowsDetected: null });

    let active = true;
    const poll = async () => {
      const state = await universityImportService.getProgress(id);
      if (!active || !state) return;
      patch((current) => ({
        ...current,
        server: state,
        rowsDetected: state.rowsDetected ?? current.rowsDetected,
      }));
    };
    const timer = window.setInterval(poll, 400);
    void poll();

    try {
      return await run({
        progressId: id,
        onUploadProgress: (percent) => patch((current) => ({ ...current, upload: percent })),
      });
    } finally {
      active = false;
      window.clearInterval(timer);
    }
  };

  /**
   * Scans the workbook (never writes). Without selections (a new file) it first
   * maps columns automatically, then scans again with those defaults so the
   * preview, validation and summary always reflect the column choices.
   */
  const scan = async (
    selected: File,
    options = { mode, defaultCountry },
    nextSelections?: SelectionState,
  ) => {
    setError(null);
    setStep("scanning");
    setConfirmOverwrite(false);

    try {
      let data: ExcelImportPreview;
      let applied = nextSelections;

      const fields = preview?.fields ?? [];

      if (applied) {
        const payload = toPayload(applied, newColumns, fields);
        data = await tracked("preview", "Re-scanning with your column choices", (track) =>
          universityImportService.previewImport(selected, {
            ...options,
            selections: payload,
            ...track,
          }),
        );
      } else {
        const auto = await tracked("preview", "Pass 1 of 2: automatic column mapping", (track) =>
          universityImportService.previewImport(selected, { ...options, ...track }),
        );
        const defaults = defaultSelections(auto);
        applied = defaults;
        data = Object.keys(defaults).length
          ? await tracked("preview", "Pass 2 of 2: validating with the column mapping", (track) =>
              universityImportService.previewImport(selected, {
                ...options,
                selections: toPayload(defaults, newColumns, auto.fields),
                ...track,
              }),
            )
          : auto;
      }

      setSelections(applied);
      setScannedKey(selectionKey(applied, newColumns, data.fields));
      setConfirmCustomFields(false);
      setPreview(data);
      setActiveSheet(
        data.sheets.find((sheet) => sheet.type === "courses" || sheet.type === "universities")
          ?.name ??
          data.sheets[0]?.name ??
          "",
      );
      setSheetFilter("ALL");
      setStep("preview");
      setProgress(null);
    } catch (scanError) {
      setProgress(null);
      setPreview(null);
      setError(errorMessage(scanError, "Failed to scan the Excel file"));
      setStep("select");
    }
  };

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;

    const extension = selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase();

    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError(`"${selected.name}" is not an Excel file. Choose an .xlsx or .xls file.`);
      return;
    }

    if (selected.size === 0) {
      setError("The selected file is empty.");
      return;
    }

    if (selected.size > MAX_FILE_BYTES) {
      setError(
        `The file is ${formatBytes(selected.size)}; the limit is ${formatBytes(MAX_FILE_BYTES)}.`,
      );
      return;
    }

    setFile(selected);
    scan(selected);
  };

  const confirmImport = async () => {
    if (!file || !preview) return;

    setError(null);
    setStep("importing");

    try {
      const data = await tracked("import", "Validating again, then saving", (track) =>
        universityImportService.confirmImport(file, {
          mode: preview.options.mode,
          defaultCountry: preview.options.defaultCountry,
          selections: Object.keys(selections).length
            ? toPayload(selections, newColumns, preview.fields)
            : undefined,
          expectedHash: preview.sha256,
          confirmOverwrite,
          confirmCustomFields,
          ...track,
        }),
      );

      setResult(data);
      setStep("result");
      setProgress(null);
      onImported();
    } catch (importError) {
      setProgress(null);
      setError(errorMessage(importError, "The import failed"));
      setStep("preview");
    }
  };

  const selectionsChanged =
    preview !== null && selectionKey(selections, newColumns, preview.fields) !== scannedKey;

  const optionsChanged =
    preview !== null &&
    (preview.options.mode !== mode ||
      preview.options.defaultCountry !== defaultCountry.trim() ||
      selectionsChanged);

  const problems = useMemo(
    () => (preview ? mappingProblems(selections, preview, newColumns) : new Map<string, string>()),
    [selections, preview, newColumns],
  );

  const changeColumn = (sheet: string, index: number, choice: ColumnChoice) =>
    setSelections((current) => ({
      ...current,
      [sheet]: { ...current[sheet], [index]: choice },
    }));

  /** Points every choice for `from` (a field key) to `to` ("" = unmapped). */
  const retarget = (from: string, to: string) =>
    setSelections((current) =>
      Object.fromEntries(
        Object.entries(current).map(([sheet, columns]) => [
          sheet,
          Object.fromEntries(
            Object.entries(columns).map(([index, choice]) => [
              index,
              choice.field === from ? { ...choice, field: to } : choice,
            ]),
          ),
        ]),
      ),
    );

  const addNewColumn = (sheet: string, column: NewColumn, sourceIndex: number | undefined) => {
    setNewColumns((current) => [...current, column]);
    if (sourceIndex !== undefined) {
      changeColumn(sheet, sourceIndex, { include: true, field: customRef(column.key) });
    }
  };

  const updateNewColumn = (id: string, patch: Partial<NewColumn>) => {
    const column = newColumns.find((item) => item.id === id);
    if (!column) return;
    if (patch.key !== undefined && patch.key !== column.key) {
      retarget(customRef(column.key), customRef(patch.key));
    }
    setNewColumns((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const removeNewColumn = (id: string) => {
    const column = newColumns.find((item) => item.id === id);
    if (column) retarget(customRef(column.key), "");
    setNewColumns((current) => current.filter((item) => item.id !== id));
  };

  const setNewColumnSource = (
    sheet: string,
    column: NewColumn,
    sourceIndex: number | undefined,
  ) => {
    const ref = customRef(column.key);
    setSelections((current) => {
      const columns = Object.fromEntries(
        Object.entries(current[sheet] ?? {}).map(([index, choice]) => [
          index,
          choice.field === ref ? { ...choice, field: "" } : choice,
        ]),
      );
      if (sourceIndex !== undefined) columns[sourceIndex] = { include: true, field: ref };
      return { ...current, [sheet]: columns };
    });
  };

  const newColumnErrors = newColumns.filter((column) =>
    newColumnProblem(column, newColumns, preview?.fields ?? []),
  ).length;
  const newCustomFields = preview?.newCustomFields ?? [];

  const needsCountry = preview?.issues.some(
    (issue) => issue.code === "missing_country_column" || issue.code === "missing_country",
  );

  const filteredIssues = useMemo(
    () =>
      (preview?.issues ?? []).filter(
        (issue) =>
          (severityFilter === "ALL" || issue.severity === severityFilter) &&
          (sheetFilter === "ALL" || issue.sheet === sheetFilter),
      ),
    [preview, severityFilter, sheetFilter],
  );

  const willUpdateUniversities = preview?.summary.willUpdate ?? 0;
  const willUpdateCourses = preview?.summary.willUpdateCourses ?? 0;
  const needsOverwriteConfirmation = willUpdateUniversities + willUpdateCourses > 0;

  const canConfirm =
    preview !== null &&
    preview.canImport &&
    preview.mappingErrors === 0 &&
    problems.size === 0 &&
    newColumnErrors === 0 &&
    !optionsChanged &&
    (!needsOverwriteConfirmation || confirmOverwrite) &&
    (newCustomFields.length === 0 || confirmCustomFields);

  return (
    <>
      <Button variant="outline" onClick={downloadTemplate} disabled={downloading}>
        {downloading ? <Loader2 className="animate-spin" /> : <Download />}
        Download Template
      </Button>

      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload />
        Upload Excel
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {step === "result"
                ? "Excel Import Completed"
                : "Import Universities & Courses from Excel"}
            </DialogTitle>
            <DialogDescription>
              {step === "result"
                ? "The valid rows were saved. Universities and courses are available in the list, the Explorer and the University Matcher."
                : "Upload a workbook of universities and/or courses to scan and validate it. Nothing is saved until you confirm the import."}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/10 p-3 text-sm">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <span>{error}</span>
            </div>
          )}

          {/* ---------- Select ---------- */}
          {step === "select" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  selectFile(event.dataTransfer.files[0]);
                }}
                className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-secondary/30 px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Choose an Excel file or drop it here</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  .xlsx or .xls, up to {formatBytes(MAX_FILE_BYTES)}. Macros and formulas are never
                  executed.
                </p>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />

              <p className="text-xs text-muted-foreground">
                Not sure about the format?{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline"
                  onClick={downloadTemplate}
                >
                  Download the Excel template
                </button>
                .
              </p>
            </div>
          )}

          {/* ---------- Busy ---------- */}
          {(step === "scanning" || step === "importing") && (
            <ExcelImportProgressPanel
              progress={progress}
              fileName={file?.name ?? ""}
              fileSize={file ? formatBytes(file.size) : ""}
            />
          )}

          {/* ---------- Preview ---------- */}
          {step === "preview" && preview && (
            <div className="min-w-0 space-y-5">
              {/* Scan summary */}
              <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">Excel Scan Summary</h3>
                  {preview.detected && (
                    <Badge variant="outline" className="border-brand/30 bg-brand/10 text-brand">
                      Detected:{" "}
                      {[
                        preview.detected.universities && "Universities",
                        preview.detected.courses && "Courses",
                      ]
                        .filter(Boolean)
                        .join(" + ") || "Nothing importable"}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="File" value={preview.fileName} />
                  <Stat label="Size" value={formatBytes(preview.fileSize)} />
                  <Stat label="Sheets" value={preview.sheetCount} />
                  <Stat label="Rows" value={preview.summary.rowsScanned} />
                  <Stat label="Columns" value={preview.summary.totalColumns} />
                  <Stat label="Valid rows" value={preview.summary.validRows} tone="text-success" />
                  <Stat
                    label="Invalid rows"
                    value={preview.summary.invalidRows}
                    tone="text-danger"
                  />
                  <Stat label="Errors" value={preview.summary.errors} tone="text-danger" />
                  <Stat
                    label="Warnings"
                    value={preview.summary.warnings}
                    tone="text-warning-foreground"
                  />
                  <Stat label="Info" value={preview.summary.infos} />
                  <Stat label="Duplicates" value={preview.summary.duplicateRows} />
                  <Stat label="Not linked" value={preview.summary.unlinkedRows} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className={rowStatusClass("valid")}>
                    New: {preview.summary.universities.new}
                  </Badge>
                  <Badge variant="outline">
                    Already exists: {preview.summary.universities.alreadyExists}
                  </Badge>
                  <Badge variant="outline" className={rowStatusClass("duplicate")}>
                    Duplicate in file: {preview.summary.universities.duplicateInFile}
                  </Badge>
                  <Badge variant="outline" className={rowStatusClass("invalid")}>
                    Invalid: {preview.summary.universities.invalid}
                  </Badge>
                  {preview.summary.courses && preview.detected?.courses && (
                    <>
                      <Badge variant="outline" className={rowStatusClass("valid")}>
                        New courses: {preview.summary.courses.new}
                      </Badge>
                      <Badge variant="outline">
                        Courses already exist: {preview.summary.courses.alreadyExists}
                      </Badge>
                      <Badge variant="outline" className={rowStatusClass("duplicate")}>
                        Duplicate courses: {preview.summary.courses.duplicateInFile}
                      </Badge>
                      <Badge variant="outline" className={rowStatusClass("invalid")}>
                        Invalid course rows: {preview.summary.courses.invalid}
                      </Badge>
                    </>
                  )}
                  <span className="text-muted-foreground">
                    Sheets: {preview.sheetNames.join(", ")}
                  </span>
                </div>
              </section>

              {/* Options */}
              <Card className="shadow-none">
                <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
                  <div>
                    <Label htmlFor="import-default-country" className="text-xs">
                      Default country{" "}
                      {needsCountry && <span className="text-danger">(required)</span>}
                    </Label>
                    <Input
                      id="import-default-country"
                      value={defaultCountry}
                      onChange={(event) => setDefaultCountry(event.target.value)}
                      placeholder="Used only where a row has no Country"
                      className="mt-1 h-9"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Universities / courses that already exist</Label>
                    <RadioGroup
                      value={mode}
                      onValueChange={(value) => setMode(value === "update" ? "update" : "skip")}
                      className="mt-2 flex flex-wrap gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="skip" id="import-mode-skip" />
                        <Label htmlFor="import-mode-skip" className="text-sm font-normal">
                          Skip existing
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="update" id="import-mode-update" />
                        <Label htmlFor="import-mode-update" className="text-sm font-normal">
                          Update existing (non-empty cells only)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <Button
                    variant={optionsChanged ? "default" : "outline"}
                    size="sm"
                    disabled={!file || !optionsChanged}
                    onClick={() =>
                      file &&
                      scan(file, { mode, defaultCountry: defaultCountry.trim() }, selections)
                    }
                  >
                    <RefreshCw />
                    Apply & re-scan
                  </Button>
                </CardContent>
              </Card>

              {/* Sheets */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Sheets</h3>
                <Tabs value={activeSheet} onValueChange={setActiveSheet}>
                  <TabsList className="h-auto flex-wrap justify-start">
                    {preview.sheets.map((sheet) => (
                      <TabsTrigger key={sheet.name} value={sheet.name} className="gap-1.5">
                        {sheet.name}
                        {sheet.invalidRows > 0 && (
                          <span className="rounded-full bg-danger/15 px-1.5 text-[10px] text-danger-foreground">
                            {sheet.invalidRows}
                          </span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {preview.sheets.map((sheet) => (
                    <TabsContent key={sheet.name} value={sheet.name} className="mt-3">
                      <SheetPanel
                        sheet={sheet}
                        choices={selections[sheet.name] ?? {}}
                        newColumns={newColumns.filter(
                          (column) => column.entity === ENTITY_BY_SHEET_TYPE[sheet.type],
                        )}
                        addColumn={
                          selections[sheet.name] && ENTITY_BY_SHEET_TYPE[sheet.type] ? (
                            <ExcelAddColumn
                              sheet={sheet}
                              fields={preview.fields}
                              newColumns={newColumns}
                              choices={selections[sheet.name] ?? {}}
                              creationEnabled={preview.customFieldCreation !== false}
                              onAdd={(column, source) => addNewColumn(sheet.name, column, source)}
                              onUpdate={updateNewColumn}
                              onRemove={removeNewColumn}
                              onSetSource={(column, source) =>
                                setNewColumnSource(sheet.name, column, source)
                              }
                            />
                          ) : undefined
                        }
                        mapping={
                          selections[sheet.name] ? (
                            <ColumnMappingTable
                              sheet={sheet}
                              fields={preview.fields}
                              choices={selections[sheet.name] ?? {}}
                              problems={problems}
                              newColumns={newColumns}
                              onChange={(index, choice) => changeColumn(sheet.name, index, choice)}
                            />
                          ) : undefined
                        }
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </section>

              {/* Mapping summary (from the last scan) */}
              {preview.hasColumnSelections && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">
                    Import mapping: Excel header → database field
                  </h3>
                  {selectionsChanged ? (
                    <p className="rounded-lg border border-dashed border-warning/40 p-4 text-center text-sm text-warning-foreground">
                      Column choices changed. Click "Apply &amp; re-scan" to validate them and
                      update this summary.
                    </p>
                  ) : (
                    <MappingSummary preview={preview} />
                  )}
                </section>
              )}

              {/* Before you import */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Before you import</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {(() => {
                    const imported = preview.sheets.filter((sheet) =>
                      [
                        "universities",
                        "courses",
                        "rankings",
                        "websites",
                        "admissionDifficulty",
                      ].includes(sheet.type),
                    );
                    const columns = imported.flatMap((sheet) => sheet.columns);
                    const selected = columns.filter(
                      (column) => column.status !== "excluded" && column.status !== "empty",
                    );
                    const existing = selected.filter(
                      (column) =>
                        column.status === "mapped" && !column.mappedTo?.startsWith("custom:"),
                    );
                    const custom = selected.filter((column) =>
                      column.mappedTo?.startsWith("custom:"),
                    );
                    return (
                      <>
                        <Stat label="Selected columns" value={selected.length} />
                        <Stat label="Mapped to existing fields" value={existing.length} />
                        <Stat label="Mapped to custom fields" value={custom.length} />
                        <Stat
                          label="Excluded columns"
                          value={columns.filter((column) => column.status === "excluded").length}
                        />
                        <Stat
                          label="Validation errors"
                          value={preview.summary.errors}
                          tone={preview.summary.errors ? "text-danger" : "text-foreground"}
                        />
                      </>
                    );
                  })()}
                </div>

                {newCustomFields.length > 0 && !selectionsChanged && (
                  <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <Database className="h-4 w-4 text-brand" />
                      New database fields ({newCustomFields.length})
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created only when you confirm the import. Values are stored under customFields
                      on each record; existing records and core fields are not changed by adding a
                      field.
                    </p>
                    <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                      {newCustomFields.map((field) => (
                        <li
                          key={`${field.entity}-${field.key}`}
                          className="flex flex-wrap items-center gap-1.5"
                        >
                          <span className="font-medium">{field.label}</span>
                          <Badge variant="outline">{CUSTOM_TYPE_LABELS[field.type]}</Badge>
                          <code className="rounded bg-secondary px-1 text-[10px]">
                            {field.entity === "course" ? "UniversityCourse" : "University"}
                            .customFields.{field.key}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {newColumns.some((column) => !column.create) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Preview-only columns (not created):{" "}
                    {newColumns
                      .filter((column) => !column.create)
                      .map((column) => column.label || "(unnamed)")
                      .join(", ")}
                    .
                  </p>
                )}
              </section>

              {/* Validation */}
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Validation Errors / Warnings</h3>

                  <div className="flex flex-wrap gap-2">
                    {(["ALL", "ERROR", "WARNING", "INFO"] as const).map((severity) => (
                      <Button
                        key={severity}
                        size="sm"
                        variant={severityFilter === severity ? "default" : "outline"}
                        className="h-8"
                        onClick={() => setSeverityFilter(severity)}
                      >
                        {severity === "ALL" ? "All" : severity}
                        <span className="text-xs opacity-70">
                          {severity === "ALL"
                            ? preview.issues.length
                            : preview.issues.filter((issue) => issue.severity === severity).length}
                        </span>
                      </Button>
                    ))}

                    <select
                      value={sheetFilter}
                      onChange={(event) => setSheetFilter(event.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="ALL">All sheets</option>
                      {preview.sheetNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {filteredIssues.length > 0 ? (
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-line/60">
                    <table className="w-full min-w-[900px] text-left text-xs">
                      <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Sheet</th>
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Column</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Message</th>
                          <th className="px-3 py-2 font-medium">Current value</th>
                          <th className="px-3 py-2 font-medium">Suggested correction</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {filteredIssues.map((issue, index) => (
                          <tr key={index} className="align-top">
                            <td className="whitespace-nowrap px-3 py-2">
                              {issue.sheet || "Workbook"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{issue.row ?? "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2">{issue.column || "—"}</td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={`gap-1 ${severityClass(issue.severity)}`}
                              >
                                <SeverityIcon severity={issue.severity} />
                                {issue.severity}
                              </Badge>
                            </td>
                            <td className="max-w-[320px] px-3 py-2">{issue.message}</td>
                            <td className="max-w-[180px] px-3 py-2 text-muted-foreground">
                              <span className="line-clamp-2">{issue.value || "—"}</span>
                            </td>
                            <td className="max-w-[240px] px-3 py-2 text-muted-foreground">
                              {issue.suggestion || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-line/60 p-4 text-center text-sm text-muted-foreground">
                    No issues for this filter.
                  </p>
                )}

                {preview.issuesTruncated && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Only the first {preview.issues.length} issues are shown.
                  </p>
                )}
              </section>

              {/* Planned universities */}
              {preview.universities.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Universities in this file</h3>
                  <div className="max-h-[220px] overflow-auto rounded-lg border border-line/60">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">University</th>
                          <th className="px-3 py-2 font-medium">Location</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {preview.universities.map((university) => (
                          <tr
                            key={`${university.action}-${university.name}-${university.sheet}-${university.rowNumber}`}
                          >
                            <td className="px-3 py-2 font-medium">
                              {university.name}
                              {university.existingId && (
                                <span className="ml-1 text-muted-foreground">
                                  ({university.existingId})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {[university.city, university.country].filter(Boolean).join(", ")}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {university.sheet}
                              {university.rowNumber ? ` row ${university.rowNumber}` : ""}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  university.action === "create"
                                    ? rowStatusClass("valid")
                                    : university.action === "update"
                                      ? rowStatusClass("duplicate")
                                      : rowStatusClass("skipped")
                                }
                              >
                                {university.action === "create"
                                  ? "New"
                                  : university.action === "update"
                                    ? "Update existing"
                                    : university.action === "link"
                                      ? "Existing (courses added)"
                                      : "Already exists (skip)"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Planned courses */}
              {(preview.courses?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Courses in this file</h3>
                  <div className="max-h-[260px] overflow-auto rounded-lg border border-line/60">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Course</th>
                          <th className="px-3 py-2 font-medium">Degree</th>
                          <th className="px-3 py-2 font-medium">University</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {preview.courses?.map((course) => (
                          <tr key={`${course.sheet}-${course.rowNumber}`}>
                            <td className="px-3 py-2 font-medium">
                              {course.courseName}
                              {course.existingId && (
                                <span className="ml-1 text-muted-foreground">
                                  ({course.existingId})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {course.degree || "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {course.universityName}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {course.sheet} row {course.rowNumber}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  course.action === "create"
                                    ? rowStatusClass("valid")
                                    : course.action === "update"
                                      ? rowStatusClass("duplicate")
                                      : rowStatusClass("skipped")
                                }
                              >
                                {course.action === "create"
                                  ? "New"
                                  : course.action === "update"
                                    ? "Update existing"
                                    : "Already exists (skip)"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.coursesTruncated && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Showing the first {preview.courses?.length} courses. All valid rows are
                      imported.
                    </p>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ---------- Result ---------- */}
          {step === "result" && result && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 rounded-md border border-success/25 bg-success/10 p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Import {result.importId} saved
                {result.transactional ? " in a single transaction" : ""}.
              </div>

              {(result.courses?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">
                  Every course row creates a course. A university is created only when it does not
                  exist yet; otherwise the course is linked to the existing university. Imported
                  courses are listed in the Explorer (Courses) and under Courses → Programmes.
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Sheets scanned" value={result.summary.sheetsScanned} />
                <Stat label="Rows scanned" value={result.summary.rowsScanned} />
                {result.summary.importedRows !== undefined && (
                  <Stat
                    label="Rows imported"
                    value={result.summary.importedRows}
                    tone="text-success"
                  />
                )}
                <Stat
                  label="Universities created"
                  value={result.summary.imported}
                  tone="text-success"
                />
                <Stat label="Universities updated" value={result.summary.updated} />
                {(result.summary.universitiesLinked ?? 0) > 0 && (
                  <Stat
                    label="Existing universities linked"
                    value={result.summary.universitiesLinked}
                  />
                )}
                {result.summary.coursesImported !== undefined && (
                  <>
                    <Stat
                      label="Courses created"
                      value={result.summary.coursesImported}
                      tone="text-success"
                    />
                    <Stat label="Courses updated" value={result.summary.coursesUpdated ?? 0} />
                  </>
                )}
                <Stat label="Skipped" value={result.summary.skipped} />
                <Stat label="Duplicates" value={result.summary.duplicates} />
                <Stat label="Failed (invalid)" value={result.summary.invalid} tone="text-danger" />
                <Stat label="Not linked" value={result.summary.unlinked} />
                <Stat label="Errors" value={result.summary.errors} tone="text-danger" />
                <Stat
                  label="Warnings"
                  value={result.summary.warnings}
                  tone="text-warning-foreground"
                />
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Imported universities</h3>
                {result.universities.length > 0 ? (
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-line/60">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">University</th>
                          <th className="px-3 py-2 font-medium">ID</th>
                          <th className="px-3 py-2 font-medium">Location</th>
                          <th className="px-3 py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {result.universities.map((university) => (
                          <tr key={university.id}>
                            <td className="px-3 py-2 font-medium">{university.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{university.id}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {[university.city, university.country].filter(Boolean).join(", ")}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  university.action === "created"
                                    ? rowStatusClass("valid")
                                    : rowStatusClass("duplicate")
                                }
                              >
                                {university.action === "created" ? "Created" : "Updated"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No universities were written.</p>
                )}
              </section>

              {(result.courses?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Imported courses</h3>
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-line/60">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Course</th>
                          <th className="px-3 py-2 font-medium">ID</th>
                          <th className="px-3 py-2 font-medium">University</th>
                          <th className="px-3 py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {result.courses?.map((course) => (
                          <tr key={course.id}>
                            <td className="px-3 py-2 font-medium">
                              {course.courseName}
                              {course.degree && (
                                <span className="ml-1 text-muted-foreground">
                                  · {course.degree}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{course.id}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {course.universityName}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  course.action === "created"
                                    ? rowStatusClass("valid")
                                    : rowStatusClass("duplicate")
                                }
                              >
                                {course.action === "created" ? "Created" : "Updated"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {(result.customFields?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">New database fields created</h3>
                  <ul className="grid gap-1 text-sm sm:grid-cols-2">
                    {result.customFields?.map((field) => (
                      <li
                        key={`${field.entity}-${field.key}`}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="font-medium">{field.label}</span>
                        <Badge variant="outline">{CUSTOM_TYPE_LABELS[field.type]}</Badge>
                        <code className="rounded bg-secondary px-1 text-[10px]">
                          {field.entity === "course" ? "UniversityCourse" : "University"}
                          .customFields.{field.key}
                        </code>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(result.failedRows?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">
                    Rows not imported ({result.failedRows?.length})
                  </h3>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Fix these cells in the workbook and import it again; rows that were imported are
                    skipped as already existing.
                  </p>
                  <div className="max-h-[260px] overflow-auto rounded-lg border border-line/60">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Sheet</th>
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Column</th>
                          <th className="px-3 py-2 font-medium">Problem</th>
                          <th className="px-3 py-2 font-medium">How to fix</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {result.failedRows?.map((failure, index) => (
                          <tr key={index} className="align-top">
                            <td className="whitespace-nowrap px-3 py-2">{failure.sheet}</td>
                            <td className="px-3 py-2 text-muted-foreground">{failure.row}</td>
                            <td className="whitespace-nowrap px-3 py-2">{failure.column || "—"}</td>
                            <td className="max-w-[320px] px-3 py-2">{failure.message}</td>
                            <td className="max-w-[260px] px-3 py-2 text-muted-foreground">
                              {failure.suggestion || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ---------- Footer ---------- */}
          {step === "preview" && preview && (
            <DialogFooter className="flex-col items-stretch gap-3 border-t border-line/60 pt-4 sm:flex-col">
              {preview.summary.errors > 0 && (
                <p className="flex items-start gap-2 text-sm text-danger-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {preview.summary.errors} error(s): rows with errors are not imported. Fix the file
                  and upload it again, or import only the valid rows.
                </p>
              )}

              {problems.size > 0 && (
                <p className="flex items-start gap-2 text-sm text-danger-foreground">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {problems.size === 1
                    ? "1 selected column needs a database field (or a different one). Map it or uncheck it in the sheet tabs."
                    : `${problems.size} selected columns need a database field (or a different one). Map them or uncheck them in the sheet tabs.`}
                </p>
              )}

              {problems.size === 0 && !selectionsChanged && preview.mappingErrors > 0 && (
                <p className="flex items-start gap-2 text-sm text-danger-foreground">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  Column mapping has {preview.mappingErrors} error(s); see the errors below. The
                  import is blocked until they are fixed.
                </p>
              )}

              {optionsChanged && (
                <p className="text-sm text-warning-foreground">
                  {selectionsChanged ? "Column choices" : "Options"} changed. Click "Apply &amp;
                  re-scan" before importing.
                </p>
              )}

              {newCustomFields.length > 0 && !optionsChanged && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={confirmCustomFields}
                    onCheckedChange={(checked) => setConfirmCustomFields(checked === true)}
                    className="mt-0.5"
                  />
                  I confirm creating {newCustomFields.length} new database field
                  {newCustomFields.length === 1 ? "" : "s"} (
                  {newCustomFields.map((field) => field.label).join(", ")}) and importing their
                  values.
                </label>
              )}

              {newColumnErrors > 0 && (
                <p className="flex items-start gap-2 text-sm text-danger-foreground">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {newColumnErrors} new column(s) need a valid name. Rename or remove them in the
                  sheet tabs.
                </p>
              )}

              {needsOverwriteConfirmation && !optionsChanged && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={confirmOverwrite}
                    onCheckedChange={(checked) => setConfirmOverwrite(checked === true)}
                    className="mt-0.5"
                  />
                  I confirm that{" "}
                  {[
                    willUpdateUniversities > 0 &&
                      `${willUpdateUniversities} existing universit${willUpdateUniversities === 1 ? "y" : "ies"}`,
                    willUpdateCourses > 0 &&
                      `${willUpdateCourses} existing course${willUpdateCourses === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" and ")}{" "}
                  will be updated with the non-empty values from this file.
                </label>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {preview.summary.errors} errors / {preview.summary.warnings} warnings ·{" "}
                  Universities: {preview.summary.willCreate} new, {preview.summary.willUpdate} to
                  update, {preview.summary.willSkip} existing skipped
                  {preview.detected?.courses &&
                    ` · Courses: ${preview.summary.willCreateCourses ?? 0} new, ${
                      preview.summary.willUpdateCourses ?? 0
                    } to update, ${preview.summary.willSkipCourses ?? 0} existing skipped`}
                </p>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    Choose another file
                  </Button>
                  <Button onClick={confirmImport} disabled={!canConfirm}>
                    <CheckCircle2 />
                    Import {preview.importRowCount} valid row
                    {preview.importRowCount === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          )}

          {step === "result" && (
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>
              {(result?.courses?.length ?? 0) > 0 && (
                <Button variant="outline" asChild>
                  <a href="/explorer?mode=courses">View imported courses</a>
                </Button>
              )}
              <Button onClick={close}>Close</Button>
            </DialogFooter>
          )}

          {step === "select" && (
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
