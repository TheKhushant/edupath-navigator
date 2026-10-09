import { CheckCircle2, Loader2, Upload, Server } from "lucide-react";

import type { ExcelImportProgress } from "@/types/crm";

/* =========================================================
   Progress of an Excel preview / import request. The workbook
   is parsed on the server, so there are two measured parts:
   the upload of the file (browser) and the server's scan /
   validation / write phases (polled). A percentage is shown
   only where the work can be counted, and never 100% before
   the server has finished.
========================================================= */

export interface TrackedProgress {
  id: string;
  request: "preview" | "import";
  /** e.g. "Pass 1 of 2: automatic column mapping" */
  label: string;
  /** Upload percent (0-100), null when the browser cannot measure it. */
  upload: number | null;
  server: ExcelImportProgress | null;
  /** Largest "rows detected" seen in the scanning phase. */
  rowsDetected: number | null;
}

const PHASES: Record<ExcelImportProgress["phase"], string> = {
  receiving: "Receiving the file",
  reading: "Reading the workbook",
  scanning: "Scanning rows",
  validating: "Validating rows",
  checking: "Preparing the summary",
  writing: "Saving to the database",
  finishing: "Updating search tags",
  done: "Finished",
  failed: "Failed",
};

const number = (value: number) => value.toLocaleString();

/** Percent of a counted phase, at most 99 until the request is done. */
function phasePercent(state: ExcelImportProgress | null) {
  if (!state) return null;
  if (state.done) return 100;
  if (!state.totalRows || state.processedRows === undefined) return null;
  return Math.min(99, Math.floor((state.processedRows / state.totalRows) * 100));
}

function Bar({ percent }: { percent: number | null }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
    >
      {percent === null ? (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

export function ExcelImportProgressPanel({
  progress,
  fileName,
  fileSize,
}: {
  progress: TrackedProgress | null;
  fileName: string;
  fileSize: string;
}) {
  const server = progress?.server ?? null;
  const uploaded = progress?.upload === 100 || Boolean(server && server.phase !== "receiving");
  const percent = phasePercent(server);
  const counted = server && server.totalRows !== undefined && server.processedRows !== undefined;

  return (
    <div className="space-y-5 py-6" aria-live="polite">
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
        <p className="mt-2 font-medium">
          {progress?.request === "import"
            ? "Importing valid rows…"
            : "Uploading and scanning the workbook…"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fileName} · {fileSize}
          {progress?.label ? ` · ${progress.label}` : ""}
        </p>
      </div>

      <div className="mx-auto grid max-w-xl gap-4">
        {/* Upload (measured in the browser) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              {uploaded ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload to the server
            </span>
            <span className="text-muted-foreground">
              {uploaded
                ? "Done"
                : progress?.upload !== null && progress?.upload !== undefined
                  ? `${progress.upload}%`
                  : "…"}
            </span>
          </div>
          <Bar percent={uploaded ? 100 : (progress?.upload ?? null)} />
        </div>

        {/* Server phases (polled) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Server className="h-3.5 w-3.5" />
              {server
                ? PHASES[server.phase]
                : uploaded
                  ? "Waiting for the server"
                  : "Server processing (after upload)"}
              {server?.detail ? `: ${server.detail}` : ""}
            </span>
            <span className="text-muted-foreground">
              {counted
                ? `${number(server.processedRows ?? 0)} / ${number(server.totalRows ?? 0)} rows`
                : ""}
              {percent !== null && counted ? ` · ${percent}%` : ""}
            </span>
          </div>
          <Bar percent={uploaded ? percent : 0} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md border border-line/60 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Rows detected
            </p>
            <p className="mt-0.5 font-semibold">
              {progress?.rowsDetected !== null && progress?.rowsDetected !== undefined
                ? number(progress.rowsDetected)
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-line/60 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Processed</p>
            <p className="mt-0.5 font-semibold">
              {counted ? number(server.processedRows ?? 0) : "—"}
            </p>
          </div>
          <div className="rounded-md border border-line/60 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Progress</p>
            <p className="mt-0.5 font-semibold">
              {percent !== null && counted ? `${percent}%` : "—"}
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          The workbook is read on the server. Upload progress is measured in the browser; row counts
          come from the server while it works.
        </p>
      </div>

      {/* Skeleton of the preview table */}
      <div className="space-y-2 rounded-lg border border-line/60 p-3" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex gap-2">
            {Array.from({ length: 6 }, (_, cell) => (
              <div key={cell} className="h-3 flex-1 animate-pulse rounded bg-secondary" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
