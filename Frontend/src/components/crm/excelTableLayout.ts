/* =========================================================
   Column widths for the Excel preview table, from the header
   and the cell contents. Long values (URLs, requirements)
   wrap / clamp inside a capped width instead of widening the
   table; the table itself scrolls horizontally.
========================================================= */

export const COLUMN_WIDTH = { min: 88, max: 340 } as const;

// Average glyph widths (px) of the table's text-xs body and uppercase 10px header
const CELL_CHAR_PX = 6.4;
const HEADER_CHAR_PX = 7.2;
const PADDING_PX = 28;
const SAMPLE_ROWS = 300;

const URL_RE = /^(https?:\/\/|www\.)\S+$/i;

export const isUrlLike = (value: string) => URL_RE.test(value.trim());

/** p-th percentile of a sorted list. */
const percentile = (sorted: number[], p: number) =>
  sorted.length ? (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0) : 0;

/**
 * Width (px) per column. Uses the 90th percentile of the cell lengths so a
 * single very long value does not stretch the column; such values are
 * clamped and shown in full on hover.
 */
export function fitColumnWidths(headers: string[], rows: string[][]): number[] {
  const sample = rows.slice(0, SAMPLE_ROWS);

  return headers.map((header, index) => {
    const lengths = sample
      .map((row) => (row[index] ?? "").length)
      .filter((length) => length > 0)
      .sort((a, b) => a - b);

    // Words of a long text wrap, so its width is limited by the longest word
    // once the content needs more than ~3 lines at the maximum width.
    const content = percentile(lengths, 0.9) * CELL_CHAR_PX;
    const headerWidth = header.length * HEADER_CHAR_PX;
    const width = Math.ceil(Math.max(content, headerWidth) + PADDING_PX);

    return Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, width));
  });
}

export const tableWidth = (widths: number[], fixedColumns = 0) =>
  widths.reduce((total, width) => total + width, fixedColumns);
