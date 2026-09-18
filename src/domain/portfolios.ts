// ==========================================================================
// WHAT A PORTFOLIO IS, AND THE ONE COLOUR IT IS DRAWN IN
//
// A portfolio used to be a union type — four words compiled into the
// application — and adding a fifth meant a developer. `db/migrations/017`
// makes it a row the administrator edits, so `Portfolio` is now a `string`
// and this file holds what the code still needs to KNOW about one.
//
// Which is two things: what the product shipped with, and what colour it is.
//
// ---- ONE TONE, NOT TWO COLOUR LANGUAGES --------------------------------
//
// Before this there were two independent colour decisions for the same four
// portfolios: a pill class on the Projects register (`Residential` blue) and
// a hex in the Dashboard's chart (`Residential` navy). Nothing tied them
// together, so a reader moving between a table and a graph was following two
// different keys for one thing — and a portfolio added tomorrow would have
// had a colour in neither.
//
// The tie is resolved in favour of THE CHART, because that is where colour
// carries the meaning: four saturated, well-separated hues, where the pills
// had a grey. So the shipped four keep the Dashboard's colours exactly and
// the pills on the Projects register moved to match them.
//
// So a portfolio carries ONE tone, chosen from this list, and everything that
// draws a portfolio asks here. The pill uses the same hex at 12% as its
// ground, which is how the shipped pills already look.
// ==========================================================================
import type { Portfolio } from './types.js';

/** The tones a portfolio may be drawn in. Mirrored by a CHECK in migration 017. */
export const PORTFOLIO_TONES = [
  'navy', 'blue', 'teal', 'green', 'amber', 'red', 'plum', 'grey',
] as const;

export type PortfolioTone = typeof PORTFOLIO_TONES[number];

/**
 * The colour each tone is, once.
 *
 * Deliberately NOT the RAG greens, ambers and reds a status badge uses at
 * full strength: these are categorical — a portfolio that happens to be
 * fourth in a list has not earned red as a warning. They are the same hues
 * the application already draws with, so a chart of portfolios sits inside
 * the palette rather than beside it.
 */
export const TONE_HEX: Record<PortfolioTone, string> = {
  navy: '#0B2545',
  blue: '#2F6DD0',
  teal: '#0E7C86',
  green: '#1E9E5A',
  amber: '#C9A227',
  red: '#B3392E',
  plum: '#6B4E9B',
  grey: '#64748B',
};

/** Whether a value is a tone this application knows how to draw. */
export const isPortfolioTone = (v: unknown): v is PortfolioTone =>
  typeof v === 'string' && (PORTFOLIO_TONES as readonly string[]).includes(v);

/** One portfolio, as the system holds it. */
export interface PortfolioRef {
  name: Portfolio;
  tone: PortfolioTone;
  sort: number;
  /** A portfolio the product shipped with. Editable; never removable. */
  builtIn: boolean;
  /** How many developments are in it. A portfolio in use is never removed. */
  developments: number;
}

/** One delivery route. No colour: nothing draws a route. */
export interface RouteRef {
  name: string;
  describes: string;
  sort: number;
  builtIn: boolean;
  developments: number;
}

/**
 * The four the product shipped with, and the tones they have always had.
 *
 * The fixtures build reads this — there is no database behind
 * `dist/index.html` — and the platform falls back to it only when the
 * reference tables have not been read yet. It is NOT the authority: the
 * table is, and a deployment that has added a fifth portfolio gets five.
 */
export const SHIPPED_PORTFOLIOS: readonly PortfolioRef[] = [
  { name: 'Residential', tone: 'navy', sort: 1, builtIn: true, developments: 0 },
  { name: 'Commercial', tone: 'blue', sort: 2, builtIn: true, developments: 0 },
  { name: 'Mixed Use', tone: 'green', sort: 3, builtIn: true, developments: 0 },
  { name: 'Land Development', tone: 'amber', sort: 4, builtIn: true, developments: 0 },
];

/**
 * The shipped route that means Tazayud runs the work itself.
 *
 * Named here, once, because ONE thing still turns on which route a
 * development is on: the default label for its delivery partner — "Internal"
 * where the owner runs it, "To be appointed" where a consultant will. That is
 * a courtesy, not a control, and "To be appointed" is the honest default for
 * a route somebody added this morning and has not described yet.
 *
 * Everything else about a route is just its name.
 */
export const SELF_EXECUTION = 'Self-Execution';

/** The default delivery partner for a development on this route. */
export const defaultPartner = (route: string): string =>
  (route === SELF_EXECUTION ? 'Internal' : 'To be appointed');

export const SHIPPED_ROUTES: readonly RouteRef[] = [
  { name: 'PMC-Delivered', sort: 1, builtIn: true, developments: 0,
    describes: 'A project management consultant runs delivery on the owner’s behalf' },
  { name: 'Self-Execution', sort: 2, builtIn: true, developments: 0,
    describes: 'Tazayud runs delivery with its own team' },
];

/**
 * The tone a portfolio is drawn in.
 *
 * `grey` for one the list does not know, which is what a development whose
 * portfolio was removed underneath it looks like — a real state, drawn
 * neutrally rather than as an unstyled pill that reads like a rendering
 * fault.
 */
export const toneOf = (
  list: readonly PortfolioRef[], name: string,
): PortfolioTone => list.find((p) => p.name === name)?.tone ?? 'grey';

/** The hex a portfolio is drawn in, for a chart. */
export const colourOf = (list: readonly PortfolioRef[], name: string): string =>
  TONE_HEX[toneOf(list, name)];

/**
 * The pill a portfolio is shown as: its own colour at full strength on a
 * 12% ground, which is how every `.b-*` pill in this application already
 * reads — and which works for a tone added after the stylesheet was written.
 */
export const pillStyle = (
  list: readonly PortfolioRef[], name: string,
): { background: string; color: string } => {
  const hex = colourOf(list, name);
  return { background: `${hex}1f`, color: hex };
};
