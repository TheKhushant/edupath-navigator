import { useCallback, useEffect, useState } from "react";

/**
 * Counsellor shortlist for the University & Course Explorer.
 *
 * Kept in this browser (localStorage), shared across tabs; a shortlist is
 * handed to a student through the presentation link, which carries the ids.
 */
export type ShortlistKind = "university" | "course";

export interface ShortlistItem {
  kind: ShortlistKind;
  id: string;
  name: string;
  subtitle?: string | undefined;
}

const STORAGE_KEY = "edupath.explorer.shortlist.v1";
const CHANGE_EVENT = "edupath-shortlist-change";
export const SHORTLIST_LIMIT = 20;

function read(): ShortlistItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is ShortlistItem =>
            (item?.kind === "university" || item?.kind === "course") &&
            typeof item.id === "string" &&
            typeof item.name === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function write(items: ShortlistItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage blocked (private mode): the shortlist still works for this page view
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useShortlist() {
  const [items, setItems] = useState<ShortlistItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: ShortlistItem[]) => {
    setItems(next);
    write(next);
  }, []);

  const has = useCallback(
    (kind: ShortlistKind, id: string) => items.some((item) => item.kind === kind && item.id === id),
    [items],
  );

  const toggle = useCallback(
    (item: ShortlistItem) => {
      const current = read();
      const exists = current.some((other) => other.kind === item.kind && other.id === item.id);
      update(
        exists
          ? current.filter((other) => !(other.kind === item.kind && other.id === item.id))
          : [...current, item].slice(-SHORTLIST_LIMIT),
      );
    },
    [update],
  );

  const remove = useCallback(
    (kind: ShortlistKind, id: string) =>
      update(read().filter((item) => !(item.kind === kind && item.id === id))),
    [update],
  );

  const clear = useCallback(() => update([]), [update]);

  return { items, has, toggle, remove, clear };
}

/** Link to the student presentation of the given items. */
export function presentationUrl(items: ShortlistItem[], student?: string) {
  const params = new URLSearchParams();
  const universities = items.filter((item) => item.kind === "university").map((item) => item.id);
  const courses = items.filter((item) => item.kind === "course").map((item) => item.id);

  if (universities.length) params.set("universities", universities.join(","));
  if (courses.length) params.set("courses", courses.join(","));
  if (student?.trim()) params.set("student", student.trim());

  return `${window.location.origin}/explorer/present?${params}`;
}
