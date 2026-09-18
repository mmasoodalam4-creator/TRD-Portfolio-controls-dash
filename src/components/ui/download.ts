// ==========================================================================
// HANDING THE BROWSER A FILE
//
// Three places produce a file the person keeps: the integrity report, the
// reporting workbooks, and the new-development template. Each had grown its
// own anchor-and-click, and they had drifted: one appended the anchor to the
// document and revoked its object URL a second later, another did neither.
//
// Both details matter, and only one of them is obvious.
//
//   * The anchor must be IN the document. A detached <a>.click() is ignored
//     outright by Firefox and by WebKit.
//   * The object URL must not be revoked in the same tick as the click. The
//     click only SCHEDULES the download; revoking immediately can pull the
//     blob out from under it, and the file silently never arrives. That is
//     the shape of "the export button does nothing".
//
// One function, so neither can be got wrong in a fourth place.
// ==========================================================================

/** The MIME type of a workbook, spelled once. */
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Save bytes as `filename`, whatever produced them. */
export function saveFile(filename: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for the download to have taken its own reference, short
  // enough that the blob is not held for the life of the page.
  setTimeout(() => { URL.revokeObjectURL(url); }, 30_000);
}

/** Save a base64 payload — the shape every template route returns. */
export function saveBase64(filename: string, base64: string, type = XLSX_TYPE): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  saveFile(filename, bytes, type);
}

/**
 * Save rows as CSV, with a byte-order mark.
 *
 * The BOM is not decoration: without it Excel on Windows reads UTF-8 as the
 * local code page, and every Arabic name in the file arrives as mojibake.
 */
export function saveCsv(filename: string, rows: readonly (readonly (string | number)[])[]): void {
  const cell = (s: string | number): string => `"${String(s).replace(/"/g, '""')}"`;
  const text = rows.map((r) => r.map(cell).join(',')).join('\r\n');
  saveFile(filename, `\uFEFF${text}`, 'text/csv;charset=utf-8');
}

/** Today, as the date stamp that goes in an exported filename. */
export const stamp = (): string => new Date().toISOString().slice(0, 10);
