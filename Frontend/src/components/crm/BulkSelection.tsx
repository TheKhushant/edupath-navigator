import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { BulkDeleteResult } from "@/services/crmServices";

/* =========================================================
   Multi-select + "Delete selected" for the record tables.
   Only rows that are currently visible can be selected, so a
   search, filter or page change never leaves hidden rows
   selected for deletion.
========================================================= */

export interface RowSelection {
  selected: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Selects every visible row, or clears them when all are selected. */
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
}

export function useRowSelection(visibleIds: string[]): RowSelection {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const key = visibleIds.join("\u0000");

  // Drop selections that are no longer visible
  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelected((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

    return {
      selected,
      isSelected: (id) => selected.has(id),
      toggle: (id) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      toggleAll: () => setSelected(allSelected ? new Set() : new Set(visibleIds)),
      clear: () => setSelected(new Set()),
      allSelected,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, key]);
}

export function SelectAllCheckbox({
  selection,
  label,
}: {
  selection: RowSelection;
  label: string;
}) {
  return (
    <Checkbox
      checked={selection.allSelected}
      onCheckedChange={selection.toggleAll}
      aria-label={`Select all ${label}`}
    />
  );
}

/** Row checkbox; clicks do not reach the row's own click handler. */
export function RowCheckbox({
  selection,
  id,
  label,
}: {
  selection: RowSelection;
  id: string;
  label: string;
}) {
  return (
    <span onClick={(event) => event.stopPropagation()} className="inline-flex">
      <Checkbox
        checked={selection.isSelected(id)}
        onCheckedChange={() => selection.toggle(id)}
        aria-label={`Select ${label}`}
      />
    </span>
  );
}

/**
 * Bar shown while rows are selected, with a confirmation dialog. `names`
 * maps the selected ids to what the user sees in the dialog.
 */
export function BulkDeleteBar({
  selection,
  noun,
  singular,
  names,
  note,
  onDelete,
}: {
  selection: RowSelection;
  /** Plural, e.g. "universities" */
  noun: string;
  /** Singular, e.g. "university" */
  singular: string;
  names: (ids: string[]) => string[];
  /** Extra line in the confirmation, e.g. what is not deleted. */
  note?: string;
  /** Deletes the ids and updates the list; returns the server result. */
  onDelete: (ids: string[]) => Promise<BulkDeleteResult>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const ids = [...selection.selected];
  const count = ids.length;
  const listed = names(ids);
  const label = (amount: number) => `${amount} ${amount === 1 ? singular : noun}`;

  const run = async () => {
    setBusy(true);
    try {
      const result = await onDelete(ids);
      selection.clear();
      setMessage({
        tone: "success",
        text:
          `${label(result.deleted)} deleted.` +
          (result.notFound.length
            ? ` ${result.notFound.length} could not be found (already deleted).`
            : ""),
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: `Delete failed: ${error instanceof Error ? error.message : "unknown error"}. Reload the list to see the current records.`,
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (!count && !message) return null;

  return (
    <>
      {count > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/25 bg-danger/5 px-4 py-2 text-sm">
          <span className="font-medium">{label(count)} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selection.clear}>
              Clear selection
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 />
              Delete selected ({count})
            </Button>
          </div>
        </div>
      ) : (
        message && (
          <div
            className={`mb-3 flex items-center justify-between gap-2 rounded-lg border px-4 py-2 text-sm ${
              message.tone === "success"
                ? "border-success/25 bg-success/10"
                : "border-danger/25 bg-danger/10"
            }`}
            role="status"
          >
            <span>{message.text}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Dismiss"
              onClick={() => setMessage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      )}

      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label(count)}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected records from the database. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
            {listed.slice(0, 10).map((name, index) => (
              <li key={index}>{name}</li>
            ))}
            {listed.length > 10 && (
              <li className="list-none text-muted-foreground">…and {listed.length - 10} more</li>
            )}
          </ul>

          {note && <p className="text-xs text-muted-foreground">{note}</p>}

          <AlertDialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={run}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete {label(count)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
