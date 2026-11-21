/**
 * CSV export helpers.
 *
 * Spreadsheet-safe: RFC 4180 quoting, CRLF row breaks and a UTF-8 BOM so Excel
 * opens rupee amounts and Indian names correctly instead of as mojibake.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

function escapeCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Quoting alone does not stop spreadsheets from evaluating untrusted formulas.
  // Keep actual numeric values numeric, including negative amounts.
  if (typeof value === 'string' && /^(?:[\s\u0000-\u001f]*[=+@-]|[\t\r\n])/.test(text)) {
    text = `'${text}`;
  }
  // Quote when the cell contains a delimiter, a quote or a line break.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

/** Triggers a browser download. No server round-trip, no extra dependency. */
export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  const blob = new Blob([`\uFEFF${toCsv(columns, rows)}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so Firefox has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** yyyy-mm-dd, for filenames. */
export function fileStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
