import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
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

function SheetPanel({ sheet }: { sheet: ExcelSheetPreview }) {
  const columnCount = Math.max(sheet.columnCount, sheet.columns.length);
  const headers = Array.from(
    { length: columnCount },
    (_, index) => sheet.columns[index]?.header || `Column ${index + 1}`,
  );

  return (
    <div className="space-y-3">
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

      {sheet.columns.length > 0 && (
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
        <div className="max-h-[340px] overflow-auto rounded-lg border border-line/60">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {headers.map((header, index) => (
                  <th key={index} className="whitespace-nowrap px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {sheet.rows.map((row) => (
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
                  {headers.map((_, index) => (
                    <td key={index} className="max-w-[260px] px-3 py-2">
                      <span className="line-clamp-3">{row.cells[index] ?? ""}</span>
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

      {sheet.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {sheet.rows.length} rows. All rows are validated and imported.
        </p>
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

  const scan = async (selected: File, options = { mode, defaultCountry }) => {
    setError(null);
    setStep("scanning");
    setConfirmOverwrite(false);

    try {
      const data = await universityImportService.previewImport(selected, options);
      setPreview(data);
      setActiveSheet(
        data.sheets.find((sheet) => sheet.type === "universities")?.name ??
          data.sheets[0]?.name ??
          "",
      );
      setSheetFilter("ALL");
      setStep("preview");
    } catch (scanError) {
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
      const data = await universityImportService.confirmImport(file, {
        mode: preview.options.mode,
        defaultCountry: preview.options.defaultCountry,
        expectedHash: preview.sha256,
        confirmOverwrite,
      });

      setResult(data);
      setStep("result");
      onImported();
    } catch (importError) {
      setError(errorMessage(importError, "The import failed"));
      setStep("preview");
    }
  };

  const optionsChanged =
    preview !== null &&
    (preview.options.mode !== mode || preview.options.defaultCountry !== defaultCountry.trim());

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

  const needsOverwriteConfirmation = (preview?.summary.willUpdate ?? 0) > 0;

  const canConfirm =
    preview !== null &&
    preview.canImport &&
    !optionsChanged &&
    (!needsOverwriteConfirmation || confirmOverwrite);

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
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {step === "result" ? "Excel Import Completed" : "Import Universities from Excel"}
            </DialogTitle>
            <DialogDescription>
              {step === "result"
                ? "The valid rows were saved. Universities are available in the list and the University Matcher."
                : "Upload a workbook to scan and validate it. Nothing is saved until you confirm the import."}
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
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 font-medium">
                {step === "scanning"
                  ? "Uploading and scanning the workbook..."
                  : "Importing valid rows..."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {file?.name} · {file ? formatBytes(file.size) : ""}
              </p>
              <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-primary/20">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            </div>
          )}

          {/* ---------- Preview ---------- */}
          {step === "preview" && preview && (
            <div className="space-y-5">
              {/* Scan summary */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Excel Scan Summary</h3>
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
                    <Label className="text-xs">Universities that already exist</Label>
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
                      file && scan(file, { mode, defaultCountry: defaultCountry.trim() })
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
                      <SheetPanel sheet={sheet} />
                    </TabsContent>
                  ))}
                </Tabs>
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

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Sheets scanned" value={result.summary.sheetsScanned} />
                <Stat label="Rows scanned" value={result.summary.rowsScanned} />
                <Stat label="Imported" value={result.summary.imported} tone="text-success" />
                <Stat label="Updated" value={result.summary.updated} />
                <Stat label="Skipped" value={result.summary.skipped} />
                <Stat label="Duplicates" value={result.summary.duplicates} />
                <Stat label="Invalid" value={result.summary.invalid} tone="text-danger" />
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

              {optionsChanged && (
                <p className="text-sm text-warning-foreground">
                  Options changed. Click "Apply & re-scan" before importing.
                </p>
              )}

              {needsOverwriteConfirmation && !optionsChanged && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={confirmOverwrite}
                    onCheckedChange={(checked) => setConfirmOverwrite(checked === true)}
                    className="mt-0.5"
                  />
                  I confirm that {preview.summary.willUpdate} existing universit
                  {preview.summary.willUpdate === 1 ? "y" : "ies"} will be updated with the
                  non-empty values from this file.
                </label>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {preview.summary.errors} errors / {preview.summary.warnings} warnings ·{" "}
                  {preview.summary.willCreate} new, {preview.summary.willUpdate} to update,{" "}
                  {preview.summary.willSkip} existing skipped
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
