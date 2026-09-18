// ==========================================================================
// A MINIMAL .xlsx READER
//
// An xlsx file is a zip of XML. Reading the handful of parts this system
// needs is about a hundred lines against node:zlib, so it is written here
// rather than pulled in as a dependency that would parse attacker-supplied
// archives with far more surface than the job requires.
//
// It lives on the SERVER on purpose. Parsing in the browser would put a
// spreadsheet reader into dist/index.html, and the portable deliverable has no
// use for one — importing a workbook is a platform feature. Keeping it here
// means the offline artifact does not grow by a byte.
//
// Deliberately partial. It reads shared strings, sheet names and cell values,
// and nothing else: no styles, no charts, no formulas beyond their cached
// result. That is all PT_TEMPLATE requires, and every format feature not
// implemented is one that cannot be used against us.
// ==========================================================================
import { inflateRawSync } from 'node:zlib';

/** One entry from the zip's central directory. */
interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Read the zip's index.
 *
 * The end-of-central-directory record is at the tail, after a comment of
 * unknown length, so it is found by scanning backwards for its signature.
 */
function readDirectory(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65_557; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');

  const count = buf.readUInt16LE(eocd + 10);
  if (count > MAX_ENTRIES) throw new Error('archive has too many entries to be a workbook');
  let offset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);

    entries.push({
      name: buf.toString('utf8', offset + 46, offset + 46 + nameLength),
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      localHeaderOffset: buf.readUInt32LE(offset + 42),
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): string {
  const start = entry.localHeaderOffset;
  if (buf.readUInt32LE(start) !== LOCAL_SIGNATURE) throw new Error(`bad entry ${entry.name}`);

  // The local header repeats the name and extra-field lengths, and they are
  // NOT always the same as the central directory's. The data begins after
  // the local ones.
  const nameLength = buf.readUInt16LE(start + 26);
  const extraLength = buf.readUInt16LE(start + 28);
  const from = start + 30 + nameLength + extraLength;
  const raw = buf.subarray(from, from + entry.compressedSize);

  // A sheet of the size this system reads is well under a megabyte of XML.
  // Without a ceiling, a few megabytes of deflate that inflate at 1000:1
  // become gigabytes in one JS string — a decompression bomb — and the process
  // dies before the structure check ever runs. zlib refuses beyond this size
  // with ERR_BUFFER_TOO_LARGE, which the caller reports as a bad workbook.
  if (entry.compressedSize > MAX_PART_BYTES) throw new Error(`${entry.name} is too large`);
  if (entry.method === 0) return raw.toString('utf8');
  if (entry.method === 8) {
    return inflateRawSync(raw, { maxOutputLength: MAX_PART_BYTES }).toString('utf8');
  }
  throw new Error(`unsupported compression in ${entry.name}`);
}

/** The most any single part of the archive may occupy, compressed or inflated. */
const MAX_PART_BYTES = 16 * 1024 * 1024;
/** More entries than any workbook has; a hostile directory is refused early. */
const MAX_ENTRIES = 2_000;

const textOf = (xml: string): string => {
  const parts = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return parts
    .map((p) => p.replace(/<[^>]+>/g, ''))
    .join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#10;/g, '\n');
};

/** A sheet as a map from cell reference (e.g. "B14") to its value as text. */
export type Sheet = Map<string, string>;

export interface Workbook {
  sheetNames: string[];
  sheet(name: string): Sheet | null;
}

export function readWorkbook(buf: Buffer): Workbook {
  const entries = readDirectory(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const read = (name: string): string | null => {
    const entry = byName.get(name);
    return entry ? readEntry(buf, entry) : null;
  };

  const workbookXml = read('xl/workbook.xml');
  if (!workbookXml) throw new Error('not an xlsx workbook');

  // Shared strings are stored once and referenced by index from every cell
  // that uses them, so they must be resolved before any cell can be read.
  const sharedXml = read('xl/sharedStrings.xml') ?? '';
  const shared = (sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map(textOf);

  const relsXml = read('xl/_rels/workbook.xml.rels') ?? '';
  const rels = new Map(
    [...relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

  const sheets = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
    .map((m) => ({ name: m[1], rel: m[2] }));

  return {
    sheetNames: sheets.map((s) => s.name),

    sheet(name: string): Sheet | null {
      const found = sheets.find((s) => s.name === name);
      const target = found ? rels.get(found.rel) : undefined;
      if (!target) return null;

      const xml = read(`xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`)
        ?? read(`xl/${target}`);
      if (!xml) return null;

      const cells: Sheet = new Map();

      // Both forms, and the self-closing one FIRST in the alternation. An
      // empty cell is written `<c r="B6" s="6"/>`, and a pattern that only
      // knows the paired form matches it as an opening tag: `[^>]*` eats the
      // slash, and the body then runs to the NEXT `</c>`, swallowing the real
      // cell that follows. That is not a hypothetical — it silently emptied
      // every column-A label in this template, which is exactly the kind of
      // quiet wrong answer a parser must not give.
      for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = m[1];
        const body = m[2] ?? '';
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        if (!ref) continue;

        const type = /t="(\w+)"/.exec(attrs)?.[1];

        // Inline strings carry their text in the cell; shared strings carry an
        // index; everything else carries the value, which for a formula cell
        // is the result Excel last cached — the number a reader would see.
        if (type === 'inlineStr') {
          cells.set(ref, textOf(body));
          continue;
        }
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (raw === undefined) continue;

        cells.set(ref, type === 's' ? (shared[Number(raw)] ?? raw) : raw);
      }
      return cells;
    },
  };
}
