// ==========================================================================
// PT_TEMPLATE → a reporting period
//
// The second door. Manual entry and Excel import are one schema: this reads a
// filled PT_TEMPLATE sheet and produces exactly the payload the entry form
// produces, so both arrive at the same validation, the same reconciliation
// controls and the same review workflow. There is no import path that skips
// anything the form goes through.
//
// ROW POSITIONS ARE FIXED, and the workbook says so itself: "Keep the row
// positions of the section headers and the PROJECT TOTAL row fixed." This
// reads those positions rather than searching for labels, because searching
// would silently accept a sheet whose structure had drifted — and a silently
// accepted wrong structure is how a period gets filed against the wrong rows.
//
// Instead the structure is VERIFIED first: if the section headers are not
// where they should be, the import is refused and says which one moved.
// ==========================================================================
import type { CategoryInput, PackageInput } from '../src/domain/types.js';
import type { SubmitPeriodMutation } from '../src/data/mutations.js';
import { readWorkbook, type Sheet } from './xlsx.js';

/** Where each section begins. Verified before anything is read. */
const SECTIONS: [row: number, startsWith: string][] = [
  [6, '1.'],
  [13, '2.'],
  [18, '3.'],
  [24, '4.'],
  [43, '5.'],
];

/** Work packages occupy rows 27–40; the PROJECT TOTAL row is 41. */
const PACKAGE_ROWS = { first: 27, last: 40 };
/** Cost categories occupy rows 47–57; the TOTAL row is 58. */
const CATEGORY_ROWS = { first: 47, last: 57 };

export class TemplateError extends Error {}

// The sheet lays section 1 and 2 out as merged three-column blocks: the label
// sits in A, G or M and its value in D, J or P. These references were read off
// the workbook itself rather than inferred — an earlier extraction of it
// reported the values one column after their labels, and building the import
// on that would have read every header figure from an empty cell.
const cell = (s: Sheet, ref: string): string => s.get(ref) ?? '';

/** A number, tolerant of blanks, thousands separators and stray spaces. */
const num = (s: Sheet, ref: string): number => {
  const raw = cell(s, ref).replace(/[, ]/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const money = (s: Sheet, ref: string): number => Math.round(num(s, ref));

/**
 * A percentage, whichever way the sheet holds it.
 *
 * Excel stores a percent-formatted cell as a fraction (0.2778), but a sheet
 * filled by typing "27.78" holds twenty-seven point seven eight. Treating the
 * second as 2778% would be a silent, enormous error in earned value, so
 * anything above 1 is read as already being a percentage.
 */
const percent = (s: Sheet, ref: string): number => {
  const v = num(s, ref);
  if (v > 1) return Math.min(1, v / 100);
  return Math.max(0, v);
};

/**
 * Refuse a workbook whose structure has moved.
 *
 * Cheap, and it converts a whole class of silent mis-import — figures read
 * from the wrong rows — into a refusal that names the problem.
 */
function verifyStructure(s: Sheet): void {
  for (const [row, prefix] of SECTIONS) {
    const label = cell(s, `A${row}`).trim();
    if (!label.startsWith(prefix)) {
      throw new TemplateError(
        `This does not match PT_TEMPLATE: row ${row} should begin section "${prefix}" `
        + `but reads "${label.slice(0, 60)}". The import was refused rather than risk `
        + 'reading figures from the wrong rows.',
      );
    }
  }
}

export interface ParsedPeriod {
  period: SubmitPeriodMutation;
  /** What was read, so the person can see it before filing. */
  summary: { packages: number; categories: number; sheet: string };
}

/**
 * Read a filled PT_TEMPLATE into a period payload.
 *
 * Nothing is written and nothing is filed: the result goes back to the entry
 * form, where the live reconciliation panel shows whether it agrees and the
 * person decides whether to submit it. An import that filed straight into the
 * workflow would be a way to enter data without looking at it.
 */
export function parsePeriod(file: Buffer, projectId: string): ParsedPeriod {
  const workbook = readWorkbook(file);

  // Either the template itself or a project's instantiation of it.
  const name = workbook.sheetNames.find((n) => n === `PT_${projectId}`)
    ?? workbook.sheetNames.find((n) => n.startsWith('PT_'))
    ?? workbook.sheetNames[0];

  const sheet = name ? workbook.sheet(name) : null;
  if (!sheet || !name) throw new TemplateError('the workbook has no readable sheet');

  verifyStructure(sheet);

  const packages: PackageInput[] = [];
  for (let row = PACKAGE_ROWS.first; row <= PACKAGE_ROWS.last; row++) {
    const code = cell(sheet, `A${row}`).trim();
    const budget = money(sheet, `F${row}`);
    // A row with no code and no budget is an unused template row, not an
    // error: the sheet ships with more rows than most developments need.
    if (!code && budget === 0) continue;

    packages.push({
      code,
      name: cell(sheet, `B${row}`).trim(),
      phase: cell(sheet, `C${row}`).trim(),
      budget,
      plannedPct: percent(sheet, `G${row}`),
      actualPct: percent(sheet, `H${row}`),
      cost: money(sheet, `K${row}`),
      committed: money(sheet, `L${row}`),
    });
  }

  const categories: CategoryInput[] = [];
  for (let row = CATEGORY_ROWS.first; row <= CATEGORY_ROWS.last; row++) {
    const cat = cell(sheet, `A${row}`).trim();
    if (!cat) continue;

    categories.push({
      cat,
      // Baseline plus approved uplift, which is what the project-level "Total
      // Approved Development Budget" is, so the two are the same quantity.
      budget: money(sheet, `E${row}`) + money(sheet, `F${row}`),
      actual: money(sheet, `G${row}`),
      committed: money(sheet, `H${row}`),
      afc: money(sheet, `I${row}`),
    });
  }

  if (packages.length === 0) {
    throw new TemplateError('no work packages were found in section 4 — nothing to file');
  }

  return {
    period: {
      kind: 'period:submit',
      at: new Date().toISOString(),
      projectId,
      period: Math.round(num(sheet, 'P9')) || 1,
      dataDate: cell(sheet, 'P10').trim(),
      // Total Approved (original plus approved uplift) is the budget the
      // system reports against; the original alone is the fallback for a sheet
      // that has not had the total filled in.
      budget: money(sheet, 'D16') || money(sheet, 'D14'),
      control: money(sheet, 'D15'),
      // The sheet's own computed AFC. Deliberately NOT the sum of the category
      // forecasts: taking that would make the "categories forecast to the
      // adopted AFC" control agree with itself by construction, and a control
      // that cannot disagree is not a control.
      afc: money(sheet, 'D22'),
      packages,
      categories,
    },
    summary: { packages: packages.length, categories: categories.length, sheet: name },
  };
}
