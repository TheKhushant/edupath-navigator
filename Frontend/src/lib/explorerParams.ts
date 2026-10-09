import type { ExplorerMode } from "@/types/crm";

/**
 * URL query parameters of the University & Course Explorer (/explorer).
 * Shared by the route (validateSearch), the page and the API calls, so a
 * filtered view can be bookmarked or sent to a colleague as a link.
 */
export const EXPLORER_FILTER_KEYS = [
  "country",
  "state",
  "city",
  "universityType",
  "degree",
  "subject",
  "specialization",
  "language",
  "intake",
  "studyMode",
  "duration",
  "maxTuition",
  "applicationMethod",
  "deadlineMonth",
  "maxIelts",
  "requirement",
] as const;

export type ExplorerFilterKey = (typeof EXPLORER_FILTER_KEYS)[number];

export const EXPLORER_PARAM_KEYS = [
  "mode",
  "q",
  "sort",
  "page",
  "view",
  ...EXPLORER_FILTER_KEYS,
] as const;

export type ExplorerSearch = Partial<Record<(typeof EXPLORER_PARAM_KEYS)[number], string>>;

/** A change to the URL; `undefined` removes the parameter. */
export type ExplorerPatch = { [Key in keyof ExplorerSearch]?: string | undefined };

/** Keeps known keys with non-empty values; numbers from the URL become strings. */
export function parseExplorerSearch(search: Record<string, unknown>): ExplorerSearch {
  const result: ExplorerSearch = {};

  for (const key of EXPLORER_PARAM_KEYS) {
    const value = search[key];
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) result[key] = text.slice(0, 120);
    }
  }

  return result;
}

export const explorerMode = (search: ExplorerSearch): ExplorerMode =>
  search.mode === "courses" ? "courses" : "universities";

/** Query string for /api/explorer/{mode}: everything except the UI-only keys. */
export function explorerApiQuery(search: ExplorerSearch, limit: number): string {
  const params = new URLSearchParams();

  for (const key of ["q", "sort", "page", ...EXPLORER_FILTER_KEYS] as const) {
    const value = search[key];
    if (value) params.set(key, value);
  }
  params.set("limit", String(limit));

  return params.toString();
}

/** /explorer/present parameters. */
export type PresentationSearch = { universities?: string; courses?: string; student?: string };

export function parsePresentationSearch(search: Record<string, unknown>): PresentationSearch {
  const result: PresentationSearch = {};

  for (const key of ["universities", "courses", "student"] as const) {
    const value = search[key];
    if (typeof value === "string" && value.trim()) result[key] = value.trim().slice(0, 600);
  }

  return result;
}
