// ==========================================================================
// THE NEW-DEVELOPMENT WORKBOOK
//
// Registering a development means saying more than its name and its budget: it
// has work packages, and those packages are awarded to counterparties. Typing
// that into a form one row at a time is how a development gets registered with
// half its scope missing, so the owner asked for a workbook.
//
// Three sheets, and the reason for each:
//
//   1 Project   the headline — id, name, portfolio, delivery route, budget.
//   2 Packages  the work breakdown. Their budgets become the CONTROL budget,
//               because the control budget is precisely the part of the
//               approved budget that has been broken down into packages. What
//               is left is the contingency, which is the definition rather
//               than an assumption.
//   3 Contracts what has been awarded, against which package, to whom, and on
//               what retention terms. Only awarded rows reach committed cost.
//
// **Importing fills the form; it does not register the development.** The same
// rule PT_TEMPLATE follows, for the same reason: an import that filed straight
// into the workflow would be a way to register a development without looking
// at it. What comes back from here goes onto the screen, where the person sees
// what was read and what it implies before anybody commits it.
//
// Row 1 of each sheet is the header the reader matches on, and `readProject`
// refuses a sheet whose headers have moved rather than reading figures from
// the wrong columns.
// ==========================================================================
import { readWorkbook, type Sheet } from './xlsx.js';
import { writeWorkbook, columnName, type Cell } from './xlsx-write.js';

export const PROJECT_TEMPLATE_FILENAME = 'TAZAYUD_NEW_DEVELOPMENT_TEMPLATE.xlsx';

const SHEET_PROJECT = '1 Project';
const SHEET_PACKAGES = '2 Packages';
const SHEET_CONTRACTS = '3 Contracts';

const PROJECT_FIELDS = [
  'Project ID', 'Project Name', 'Portfolio', 'Delivery Route', 'Approved Budget (SAR)',
];
const PACKAGE_HEADERS = ['WBS Code', 'Package / Scope', 'Package Budget (SAR)'];
const CONTRACT_HEADERS = [
  'Package No.', 'Contract / Scope', 'WBS Code', 'Contractor', 'Role',
  'Award Value (SAR)', 'Retention %', 'Award Date (YYYY-MM-DD)',
];

/** What a filled workbook says. Nothing here has been committed. */
export interface ProjectImport {
  project: {
    id: string;
    name: string;
    portfolio: string;
    route: string;
    budget: number;
  };
  packages: { code: string; name: string; budget: number }[];
  contracts: {
    id: string;
    name: string;
    wbs: string;
    contractor: string;
    role: string;
    value: number;
    retention: number;
    awarded: string | null;
  }[];
  /**
   * Rows that were present but not filled in, so the screen can say so.
   *
   * The template ships an example row on each of the two register sheets, and
   * a person who fills in three packages leaves three of the six examples
   * blank. Those rows are not packages; carrying them through registered a
   * development whose work breakdown summed to nothing, which the
   * reconciliation controls then refused. Skipping them is right — doing it
   * SILENTLY is not, because the person would never learn that two of the
   * rows they typed were dropped for want of a budget.
   */
  skipped: { packages: number; contracts: number };
}

/**
 * The two spellings of the self-delivered route.
 *
 * The workbook said "Self-Delivered" and the system has only ever accepted
 * "Self-Execution", so anybody who followed the note in the template produced
 * a route the form could not show. The note is corrected below; this keeps
 * every workbook already sent out working.
 */
function normaliseRoute(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (v === 'self-delivered' || v === 'self-execution' || v === 'self') return 'Self-Execution';
  if (v === 'pmc-delivered' || v === 'pmc') return 'PMC-Delivered';
  return raw.trim();
}

/**
 * The portfolio a workbook meant, matched however it was capitalised or
 * spaced — against the portfolios THIS DEPLOYMENT HOLDS.
 *
 * The four were written into this file, so a workbook naming a fifth that an
 * administrator had added came through with whatever capitalisation somebody
 * typed and was then refused by the validator as unknown. The list is passed
 * in for the same reason the validator's is: since migration 017 it is a row,
 * and this file cannot know it.
 *
 * A name that matches nothing is passed through UNCHANGED rather than
 * corrected to something plausible: the validator refuses it by name, which
 * is a message the person can act on, and quietly filing it under the nearest
 * portfolio would put a development in the wrong roll-up.
 */
function normalisePortfolio(raw: string, known: readonly string[]): string {
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return known.find((p) => p.toLowerCase() === v) ?? raw.trim();
}

/** The blank workbook, with one worked example row per sheet. */
export function buildProjectTemplate(): Buffer {
  const project: Cell[][] = [
    ['Field', 'Value'],
    ...PROJECT_FIELDS.map((f): Cell[] => [f, '']),
    [],
    ['Notes', 'Project ID is three capitals, a dash and two digits, e.g. RES-03.'],
    ['', 'Portfolio: Residential, Commercial, Mixed Use or Land Development.'],
    ['', 'Delivery Route: PMC-Delivered or Self-Execution.'],
    ['', 'Approved Budget in whole riyals, e.g. 640000000 or 640,000,000.'],
    ['', 'Do not move or rename these rows: the importer reads them by position.'],
  ];

  // The budget column is left EMPTY rather than written as 0. A zero reads as
  // a decision — this package is worth nothing — and a blank reads as what it
  // is: a row nobody has filled in yet. The importer skips a package with no
  // budget and says how many it skipped.
  const packages: Cell[][] = [
    PACKAGE_HEADERS,
    ['1.1', 'Pre-Construction', ''],
    ['1.2', 'Substructure', ''],
    ['1.3', 'Superstructure', ''],
    ['1.4', 'MEP', ''],
    ['1.5', 'Finishes', ''],
    ['1.6', 'External Works', ''],
    [],
    ['Notes', 'Package budgets are the control budget. What the approved budget'],
    ['', 'leaves over is the contingency held centrally — that is the definition.'],
    ['', 'A row with no budget is IGNORED on import, so delete or leave the'],
    ['', 'package names you do not use — they will not be registered.'],
    ['', 'Add or remove rows freely; the header row must stay in row 1.'],
  ];

  const contracts: Cell[][] = [
    CONTRACT_HEADERS,
    ['PKG-01', '', '1.2', '', 'Main Contractor', '', 5, ''],
    [],
    ['Notes', 'Role: Main Contractor, Trade Contractor, Supplier, PMC,'],
    ['', 'Design Consultant or Verification Consultant.'],
    ['', 'A row with no contractor or no award value is IGNORED on import.'],
    ['', 'Leave the award date blank while a package is out to tender: such a'],
    ['', 'package carries an estimate but commits the owner to nothing.'],
    ['', 'Retention % is the DEFAULT a payment claim starts from; each claim'],
    ['', 'sets its own rate.'],
  ];

  return writeWorkbook([
    { name: SHEET_PROJECT, rows: project },
    { name: SHEET_PACKAGES, rows: packages },
    { name: SHEET_CONTRACTS, rows: contracts },
  ]);
}

const cell = (s: Sheet, col: number, row: number): string =>
  (s.get(`${columnName(col)}${row}`) ?? '').trim();

/** A figure written as "1,250,000" or "1250000". Blank reads as zero. */
const money = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/**
 * Refuse a workbook whose shape is not the one this reader was written for.
 *
 * Rubbish bytes only exercise the zip reader. A workbook that opens but whose
 * columns have been reordered is the dangerous case: without this it would be
 * read confidently and wrongly, and a contractor's name would arrive in the
 * award-value column.
 */
export function verifyProjectStructure(buf: Buffer): string | null {
  let wb;
  try {
    wb = readWorkbook(buf);
  } catch {
    return 'that file could not be read as a workbook';
  }

  for (const name of [SHEET_PROJECT, SHEET_PACKAGES, SHEET_CONTRACTS]) {
    if (!wb.sheetNames.includes(name)) return `the workbook has no sheet named "${name}"`;
  }

  const project = wb.sheet(SHEET_PROJECT);
  if (!project) return `sheet "${SHEET_PROJECT}" could not be read`;
  for (let i = 0; i < PROJECT_FIELDS.length; i++) {
    const label = cell(project, 0, i + 2);
    if (label !== PROJECT_FIELDS[i]) {
      return `"${SHEET_PROJECT}" row ${i + 2} should be "${PROJECT_FIELDS[i]}" and reads "${label}"`;
    }
  }

  const checkHeaders = (sheetName: string, headers: string[]): string | null => {
    const s = wb.sheet(sheetName);
    if (!s) return `sheet "${sheetName}" could not be read`;
    for (let c = 0; c < headers.length; c++) {
      const got = cell(s, c, 1);
      if (got !== headers[c]) {
        return `"${sheetName}" column ${columnName(c)} should be "${headers[c]}" and reads "${got}"`;
      }
    }
    return null;
  };

  return checkHeaders(SHEET_PACKAGES, PACKAGE_HEADERS)
    ?? checkHeaders(SHEET_CONTRACTS, CONTRACT_HEADERS);
}

/** Read a filled workbook. The structure is verified first, by the caller. */
export function readProject(buf: Buffer, knownPortfolios: readonly string[] = []): ProjectImport {
  const wb = readWorkbook(buf);
  const p = wb.sheet(SHEET_PROJECT);
  const pk = wb.sheet(SHEET_PACKAGES);
  const ct = wb.sheet(SHEET_CONTRACTS);
  if (!p || !pk || !ct) throw new Error('the workbook is missing a sheet');

  const value = (i: number): string => cell(p, 1, i + 2);

  const packages: ProjectImport['packages'] = [];
  const skipped = { packages: 0, contracts: 0 };
  for (let row = 2; row <= 400; row++) {
    const code = cell(pk, 0, row);
    const name = cell(pk, 1, row);
    // A blank code ends the table. "Notes" is the block beneath it.
    if (!code || code === 'Notes') break;
    const budget = money(cell(pk, 2, row));
    // A row with no budget is an EXAMPLE somebody left alone, not a package.
    // Its budget is what makes it part of the control budget, so a row without
    // one contributes nothing and belongs nowhere near the register.
    if (!Number.isFinite(budget) || budget <= 0) { skipped.packages++; continue; }
    packages.push({ code, name, budget });
  }

  const contracts: ProjectImport['contracts'] = [];
  for (let row = 2; row <= 400; row++) {
    const id = cell(ct, 0, row);
    if (!id || id === 'Notes') break;
    const contractor = cell(ct, 3, row);
    const valueOf = money(cell(ct, 5, row));
    // Same rule: a package number with nobody's name against it and no value
    // is the shipped example. A contract row exists to say who is doing the
    // work and for how much.
    if (!contractor || !Number.isFinite(valueOf) || valueOf <= 0) { skipped.contracts++; continue; }
    const awarded = cell(ct, 7, row);
    contracts.push({
      id,
      name: cell(ct, 1, row),
      wbs: cell(ct, 2, row),
      contractor,
      role: cell(ct, 4, row),
      value: valueOf,
      retention: money(cell(ct, 6, row)),
      awarded: awarded || null,
    });
  }

  return {
    project: {
      id: value(0).toUpperCase(),
      name: value(1),
      portfolio: normalisePortfolio(value(2), knownPortfolios),
      route: normaliseRoute(value(3)),
      budget: money(value(4)),
    },
    packages,
    contracts,
    skipped,
  };
}
