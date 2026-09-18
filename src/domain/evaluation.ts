// ==========================================================================
// COUNTERPARTY EVALUATION
//
// A score for each organisation working on a development — main contractor,
// trade contractor, supplier, PMC, design consultant, verification consultant.
//
// Eighty of the hundred marks are MEASURED from data the system already holds.
// Nothing here reads a stored score, and nothing is scored from a criterion
// the system cannot evidence: an evaluation that quietly invents its inputs is
// worse than no evaluation, because it carries a number into a procurement
// decision.
//
// The remaining twenty are the PMO's own judgement, and they are deliberately
// NOT computed here. Until an assessment is recorded against a counterparty the
// score stands at what was measured, out of eighty, and the screen says so
// rather than scaling the measured marks up to look complete.
//
// Schedule performance is the one place where attribution is not exact:
// several packages may sit under one WBS node, so a package takes the node's
// earned and planned value in proportion to its share of the commitment in
// that node. That is stated on the screen. Every other criterion is
// attributable without apportionment.
//
// Cost is scored as VARIATION DISCIPLINE rather than as CPI, and the reason is
// worth recording. Earned value is derived as AC x BAC / AFC, so CPI collapses
// to BAC / AFC — the same figure for every package of a development. A
// criterion that awards every counterparty on a development the identical mark
// discriminates nothing while looking as though it does, which is worse than
// leaving cost out. What an owner actually wants to know is which counterparty
// keeps coming back for more money, and approved variations against their own
// packages answer exactly that.
// ==========================================================================
import type {
  CounterpartyRole, Ncr, PaymentClaim, ProcurementPackage, Variation, WbsNode,
} from './types.js';
import { UNPACKAGED_COMMITMENTS } from './types.js';
import { isOpenNcr } from './counts.js';

export interface Criterion {
  name: string;
  /** What was measured, in the units the reader thinks in. */
  measured: string;
  /** Where the figure came from, so a disputed score can be traced. */
  source: string;
  weight: number;
  /** Marks awarded, out of `weight`. */
  score: number;
}

export interface Assessment {
  name: string;
  role: CounterpartyRole;
  packages: number;
  committed: number;
  criteria: Criterion[];
  /** Marks measured, out of 80. */
  measured: number;
  /** Marks available from measurement. Always 80; kept explicit for the UI. */
  measuredOutOf: number;
  /** The measured marks as a percentage of what was available. */
  percent: number;
  band: 'Strong' | 'Satisfactory' | 'Monitor' | 'Needs intervention';
  /** True when nothing this counterparty does has been claimed for yet. */
  thin: boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Linear between a floor that scores nothing and a ceiling that scores full. */
const between = (v: number, floor: number, ceiling: number): number =>
  clamp01((v - floor) / (ceiling - floor));

const round1 = (v: number): number => Math.round(v * 10) / 10;

const bandOf = (percent: number): Assessment['band'] =>
  (percent >= 85 ? 'Strong'
    : percent >= 70 ? 'Satisfactory'
      : percent >= 55 ? 'Monitor' : 'Needs intervention');

/** Whole days between two ISO dates, or null if either is missing. */
const daysBetween = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * The earned value, planned value and actual cost attributable to one package.
 *
 * The WBS node it sits under holds the figures; the package takes them in
 * proportion to its share of what has been committed under that node. Where a
 * node carries exactly one package this is exact.
 */
function performanceOf(
  own: ProcurementPackage[],
  allPackages: ProcurementPackage[],
  wbs: WbsNode[],
): { ev: number; pv: number } {
  let ev = 0;
  let pv = 0;
  for (const pkg of own) {
    const node = wbs.find((n) => n.code === pkg.wbs);
    if (!node) continue;
    const inNode = allPackages.filter((x) => x.wbs === pkg.wbs);
    const total = inNode.reduce((a, x) => a + x.committed, 0);
    const share = total > 0 ? pkg.committed / total : 0;
    ev += node.ev * share;
    pv += node.pv * share;
  }
  return { ev, pv };
}

/**
 * Score every counterparty on a development.
 *
 * Ordered by what is committed to them, because that is the order in which a
 * poor score costs the owner money.
 */
/**
 * A row carrying the development it came from, where several are in scope.
 *
 * The registers are derived from one template, so PR-002 exists on every
 * development. Matching a non-conformance to a package by id alone would
 * attribute RES-01's defect to whoever holds PR-002 on LND-02 — right today
 * only because both are the same organisation, and wrong the day the data is
 * real. The development is part of the identity, so it is part of the key.
 */
type FromDevelopment<T> = T & { project?: string };

/** `project/id`, or the id alone on a single development. */
const attribution = (project: string | undefined, id: string): string =>
  (project ? `${project}/${id}` : id);

export function assessCounterparties(
  packages: readonly FromDevelopment<ProcurementPackage>[],
  claims: readonly PaymentClaim[],
  ncrs: readonly FromDevelopment<Ncr>[],
  variations: readonly FromDevelopment<Variation>[],
  wbs: readonly WbsNode[],
): Assessment[] {
  // The "not yet packaged" row a new development carries for committed cost
  // that has no contract behind it names an absence, not an organisation:
  // scoring it would present a bookkeeping row as a counterparty.
  const scoreable = packages.filter((x) => x.contractor !== UNPACKAGED_COMMITMENTS);
  const names = [...new Set(scoreable.map((x) => x.contractor))];
  const all = [...scoreable];
  const level1 = wbs.filter((n) => n.level === 1);

  return names
    .map((name) => {
      const own = scoreable.filter((x) => x.contractor === name);
      const ownIds = new Set(own.map((x) => attribution(x.project, x.id)));
      const ownClaims = claims.filter((c) => c.contractor === name);
      const ownNcrs = ncrs.filter((n) => ownIds.has(attribution(n.project, n.packageId)));
      const committed = own.reduce((a, x) => a + x.committed, 0);

      // ---- schedule, apportioned from the WBS ---------------------------
      const { ev, pv } = performanceOf(own, all, level1);
      const spi = pv > 0 ? ev / pv : 1;

      // ---- variation discipline, attributable exactly --------------------
      // Approved only: a variation under review has changed nothing yet, and a
      // rejected one was the owner saying no rather than the counterparty
      // being at fault.
      const ownVariations = variations.filter(
        (v) => ownIds.has(attribution(v.project, v.packageId)) && v.status === 'Approved',
      );
      const varied = ownVariations.reduce((a, v) => a + v.amount, 0);
      const award = own.reduce((a, x) => a + x.value, 0);
      const variedShare = award > 0 ? varied / award : 0;

      // ---- claim accuracy, attributable exactly --------------------------
      const decided = ownClaims.filter((c) => c.approved !== null);
      const claimedTotal = decided.reduce((a, c) => a + c.claimed, 0);
      const approvedTotal = decided.reduce((a, c) => a + (c.approved ?? 0), 0);
      const accuracy = claimedTotal > 0 ? approvedTotal / claimedTotal : 1;

      // ---- turnaround, from the claim's own dates ------------------------
      const turnarounds = ownClaims
        .map((c) => daysBetween(c.raised, c.verifiedOn))
        .filter((d): d is number => d !== null && d >= 0);
      const days = median(turnarounds);

      // ---- quality, weighted by severity ---------------------------------
      // Per hundred million committed, so a trade contractor with one package
      // is not flattered against a main contractor with five.
      //
      // "Open" is `isOpenNcr`, the one definition. This line used to be
      // `status !== 'Closed'`, which counted a Completed non-conformance —
      // one answered and signed off — as open, and scored the counterparty
      // down for work that is finished. The same register would then show a
      // different open count here and on the Quality module.
      const openNcrs = ownNcrs.filter(isOpenNcr);
      const weightedNcrs = openNcrs.reduce((a, n) => a + (n.severity === 'Major' ? 2 : 1), 0);
      const per100m = committed > 0 ? (weightedNcrs * 100_000_000) / committed : 0;

      const criteria: Criterion[] = [
        {
          name: 'Cost discipline',
          measured: ownVariations.length
            ? `${(variedShare * 100).toFixed(1)}% of award varied`
            : 'No approved variation',
          source: `${ownVariations.length} approved variation${ownVariations.length === 1 ? '' : 's'} against their packages`,
          weight: 20,
          score: round1(clamp01(1 - variedShare / 0.1) * 20),
        },
        {
          name: 'Schedule performance',
          measured: `SPI ${spi.toFixed(2)}`,
          source: 'Earned value against planned value on their packages',
          weight: 20,
          score: round1(between(spi, 0.85, 1.05) * 20),
        },
        {
          name: 'Claim accuracy',
          measured: decided.length
            ? `${(accuracy * 100).toFixed(1)}% approved of claimed`
            : 'No claim decided yet',
          source: `${decided.length} decided claim${decided.length === 1 ? '' : 's'}`,
          weight: 15,
          score: decided.length ? round1(between(accuracy, 0.85, 1) * 15) : 0,
        },
        {
          name: 'Claim turnaround',
          measured: turnarounds.length ? `${days} days to verification` : 'Nothing verified yet',
          source: `${turnarounds.length} verified claim${turnarounds.length === 1 ? '' : 's'}`,
          weight: 10,
          score: turnarounds.length ? round1(between(21 - days, 0, 14) * 10) : 0,
        },
        {
          name: 'Quality',
          measured: openNcrs.length
            ? `${openNcrs.length} open non-conformance${openNcrs.length === 1 ? '' : 's'}`
            : 'None open',
          source: 'Quality register, weighted by severity, per 100M committed',
          weight: 15,
          score: round1(clamp01(1 - per100m / 3) * 15),
        },
      ];

      const measured = round1(criteria.reduce((a, c) => a + c.score, 0));
      const measuredOutOf = criteria.reduce((a, c) => a + c.weight, 0);
      const percent = round1((measured / measuredOutOf) * 100);

      return {
        name,
        role: own[0].role,
        packages: own.length,
        committed,
        criteria,
        measured,
        measuredOutOf,
        percent,
        band: bandOf(percent),
        // Two criteria out of five need a decided claim. A counterparty that
        // has never claimed is not badly performing; it is unmeasured, and the
        // screen must not present the difference as a judgement.
        thin: decided.length === 0,
      };
    })
    .sort((a, b) => b.committed - a.committed);
}

/** The three criteria the PMO scores by hand, and what each is worth. */
export const JUDGEMENT_CRITERIA: [string, number, string][] = [
  ['Site management and staffing', 10, 'Complement on site against what was agreed, and how it is run'],
  ['Responsiveness and reporting', 5, 'Whether reports arrive on time and questions are answered'],
  ['HSE culture', 5, 'What is observed on site, beyond the incident count'],
];
