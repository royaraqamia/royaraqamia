/**
 * The one CSV-cell escaper. Spreadsheet applications evaluate a quoted cell that
 * begins with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula, so
 * quoting alone is not enough: a free-text cell is defused first, then quoted.
 */

const FORMULA_LEAD = /^[=+\-@\t\r]/;

function quoteCell(text: string): string {
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Escapes a free-text cell: a formula lead is neutralised, then the quote rule applies. */
export function escapeCsvText(value: string | null | undefined): string {
  const text = value == null ? '' : value;
  return quoteCell(FORMULA_LEAD.test(text) ? `'${text}` : text);
}

/**
 * Escapes a cell whose content is format-controlled (a date, a number) or already
 * defused: quoting only, so the file still imports as data.
 */
export function escapeCsvLiteral(value: string | number | null | undefined): string {
  return quoteCell(value == null ? '' : String(value));
}
