/**
 * HAYAT GARDEN WALK RESIDENCE — the scenario, as data.
 *
 * One module holds every figure of the owner's acceptance story so the two
 * things that replay it — the browser acceptance run (e2e-hgw.mjs) and the
 * remote seeder (seed-hgw-remote.mjs) — can never drift apart: a year from
 * August 2025 to August 2026, three contractors on five packages, the
 * finishes package awarded mid-year, quarterly claims paid to ~80%, and a
 * job 90% complete a month past its planned finish.
 */

export const ID = 'RES-03';
export const NAME = 'Hayat Garden Walk Residence';
export const BUDGET = 19_200_000;    // authorised, under the 20M cap
export const CONTROL = 18_000_000;   // the five packages
export const START = '2025-08-01';
export const FINISH = '2026-08-01';  // one year; period 13 reports a month past it

// Three contractors across five packages.
export const HAYAT = 'Hayat Builders Co.';       // enabling + substructure
export const GULF = 'Gulf Structures LLC';       // superstructure + finishes
export const NOOR = 'Noor MEP Services';         // MEP

export const PKG = [
  { code: '1.1', name: 'Enabling & Mobilisation', budget: 1_500_000 },
  { code: '1.2', name: 'Substructure', budget: 3_500_000 },
  { code: '1.3', name: 'Superstructure & Envelope', budget: 6_500_000 },
  { code: '1.4', name: 'MEP', budget: 3_500_000 },
  { code: '1.5', name: 'Finishes & Landscaping', budget: 3_000_000 },
];

/** [id, name, wbs, contractor, role, value, retention, awarded ('' = tender)] */
export const CONTRACTS = [
  ['PKG-01', 'Enabling works', '1.1', HAYAT, 'Main Contractor', 1_500_000, 5, '2025-07-20'],
  ['PKG-02', 'Substructure works', '1.2', HAYAT, 'Main Contractor', 3_500_000, 5, '2025-07-20'],
  ['PKG-03', 'Superstructure & envelope', '1.3', GULF, 'Trade Contractor', 6_500_000, 5, '2025-08-10'],
  ['PKG-04', 'MEP installation', '1.4', NOOR, 'Trade Contractor', 3_500_000, 5, '2025-09-01'],
  ['PKG-05', 'Finishes & landscaping', '1.5', GULF, 'Trade Contractor', 2_900_000, 5, ''],
];
export const COMMITTED_AT_CREATE = 15_000_000;   // the four awarded contracts
export const AWARD = { id: 'PKG-05', value: 3_000_000, date: '2026-01-10' };

// Cumulative planned and actual completion per package, in percent, for the
// thirteen months. The planned curve finishes the job by July 2026; the
// actual curve reaches 90% of the budget a month after the planned finish.
export const PLANNED = [
  [50, 0, 0, 0, 0], [100, 20, 0, 0, 0], [100, 50, 0, 0, 0], [100, 80, 10, 0, 0],
  [100, 100, 25, 5, 0], [100, 100, 40, 15, 0], [100, 100, 55, 30, 10],
  [100, 100, 70, 45, 25], [100, 100, 85, 60, 40], [100, 100, 95, 75, 60],
  [100, 100, 100, 90, 80], [100, 100, 100, 100, 100], [100, 100, 100, 100, 100],
];
export const ACTUAL = [
  [47, 0, 0, 0, 0], [90, 19, 0, 0, 0], [100, 42, 0, 0, 0], [100, 62, 11, 0, 0],
  [100, 85, 22, 0, 0], [100, 100, 30, 8, 0], [100, 100, 44, 22, 13],
  [100, 100, 57, 36, 32], [100, 100, 73, 55, 38], [100, 100, 84, 68, 55],
  [100, 100, 93, 80, 72], [100, 100, 98, 88, 75], [100, 100, 100, 95, 82],
];
// Cumulative actual cost per month; CPI holds between 0.96 and 0.98.
export const AC = [720_000, 2_080_000, 3_050_000, 4_520_000, 6_150_000, 7_500_000,
  9_350_000, 11_350_000, 13_300_000, 15_050_000, 16_600_000, 17_300_000, 17_900_000];
// The adopted AFC: the budget until the delay's cost pressure is adopted in
// March, 400K over the budget from then on.
export const afcFor = (m) => (m <= 7 ? 19_200_000 : 19_600_000);

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Month m (1..13) → { year, index (0-11), label "31 August 2025" }. */
export const monthOf = (m) => {
  const year = m <= 5 ? 2025 : 2026;
  const index = m <= 5 ? m + 6 : m - 6;
  return { year, index, label: `${MONTH_DAYS[index]} ${MONTH_FULL[index]} ${year}` };
};

/** Integers that sum exactly to `total`, split by `weights` (largest remainder). */
const split = (total, weights) => {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!sum) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, v) => a + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length][1]] += 1;
  return out;
};

/** Everything month m implies, computed the way the application computes it. */
export function monthData(m) {
  const pl = PLANNED[m - 1];
  const ac = ACTUAL[m - 1];
  const evRows = PKG.map((p, i) => Math.round((p.budget * ac[i]) / 100));
  const pvRows = PKG.map((p, i) => Math.round((p.budget * pl[i]) / 100));
  const ev = evRows.reduce((a, v) => a + v, 0);
  const pv = pvRows.reduce((a, v) => a + v, 0);
  const actual = AC[m - 1];
  const costRows = split(actual, evRows);
  const committedRows = [1_500_000, 3_500_000, 6_500_000, 3_500_000, m >= 6 ? 3_000_000 : 0];
  const committed = committedRows.reduce((a, v) => a + v, 0);
  const owner = Math.min(30_000 * m, Math.max(0, actual - costRows[3]));
  const categories = [
    { cat: 'Construction Works', budget: 14_000_000, committed: committed - 3_500_000, actual: actual - costRows[3] - owner, afc: m <= 7 ? 14_000_000 : 14_400_000 },
    { cat: 'MEP Services', budget: 3_500_000, committed: 3_500_000, actual: costRows[3], afc: 3_500_000 },
    { cat: 'Owner Costs & Statutory', budget: 1_700_000, committed: 0, actual: owner, afc: 1_700_000 },
  ];
  const packages = PKG.map((p, i) => ({
    planned: pl[i], actual: ac[i], cost: costRows[i], committed: committedRows[i],
  }));
  return { pv, ev, actual, committed, afc: afcFor(m), packages, categories };
}

/** Month m as the period:submit mutation the API accepts. */
export function periodMutation(m, at = new Date().toISOString()) {
  const d = monthData(m);
  return {
    kind: 'period:submit',
    at,
    projectId: ID,
    period: m,
    dataDate: monthOf(m).label,
    budget: BUDGET,
    control: CONTROL,
    afc: d.afc,
    packages: PKG.map((p, i) => ({
      code: p.code,
      name: p.name,
      phase: '',
      budget: p.budget,
      plannedPct: d.packages[i].planned / 100,
      actualPct: d.packages[i].actual / 100,
      cost: d.packages[i].cost,
      committed: d.packages[i].committed,
    })),
    categories: d.categories,
  };
}

// The status every month must report, derived by the same rule the platform
// applies (spi/cpi to two decimals; past-finish at the end).
export const STATUS = ['At Risk', 'At Risk', 'At Risk', 'Delayed', 'Delayed', 'Delayed',
  'At Risk', 'At Risk', 'At Risk', 'At Risk', 'At Risk', 'At Risk', 'Delayed'];

// The quarterly payment claims. 5% retention on every claim; per contractor
// the nets land at roughly 80% of commitment.
export const CLAIMS = {
  3: [
    { ref: 'PC-A-01', pkg: 'PKG-02', milestone: 'Enabling complete; substructure raft poured', claimed: 2_320_000, verified: 2_250_000, approved: 2_200_000 },
  ],
  6: [
    { ref: 'PC-A-02', pkg: 'PKG-02', milestone: 'Substructure complete and backfilled', claimed: 1_680_000, verified: 1_620_000, approved: 1_600_000 },
    { ref: 'PC-B-01', pkg: 'PKG-03', milestone: 'Superstructure to level 2', claimed: 1_580_000, verified: 1_520_000, approved: 1_500_000 },
  ],
  9: [
    { ref: 'PC-B-02', pkg: 'PKG-03', milestone: 'Superstructure topped out; envelope started', claimed: 3_360_000, verified: 3_250_000, approved: 3_200_000 },
    { ref: 'PC-C-01', pkg: 'PKG-04', milestone: 'MEP first fix, levels 1–4', claimed: 1_180_000, verified: 1_130_000, approved: 1_100_000 },
  ],
  12: [
    { ref: 'PC-A-03', pkg: 'PKG-01', milestone: 'Enabling final account agreed', claimed: 420_000, verified: 405_000, approved: 400_000 },
    { ref: 'PC-B-03', pkg: 'PKG-05', milestone: 'Finishes to level 6; hard landscaping', claimed: 3_450_000, verified: 3_340_000, approved: 3_300_000 },
    { ref: 'PC-C-02', pkg: 'PKG-04', milestone: 'MEP second fix and risers', claimed: 1_470_000, verified: 1_420_000, approved: 1_400_000 },
  ],
};
export const VERIFIER = 'Injaz Engineering Consultants';
export const RATE = 5;

/** The claim of month m as the claim:record mutation the API accepts. */
export function claimMutation(m, c, at = new Date().toISOString()) {
  const { year, index } = monthOf(m);
  return {
    kind: 'claim:record',
    at,
    projectId: ID,
    packageId: c.pkg,
    milestone: c.milestone,
    claimed: c.claimed,
    verifiedBy: VERIFIER,
    verifiedOn: `${year}-${String(index + 1).padStart(2, '0')}-20`,
    verifiedRef: `VR-${c.ref}`,
    verified: c.verified,
    approved: c.approved,
    retentionRate: RATE,
    reference: c.ref,
  };
}

export const CERTIFIED_TOTAL = 14_700_000;                  // Σ approved
export const PAID_BEFORE_RELEASE = 13_965_000;              // Σ net of 5% retention
export const RELEASE = 100_000;                             // released to Hayat at the end
export const PAID_TOTAL = PAID_BEFORE_RELEASE + RELEASE;    // 14,065,000
export const cumCertified = (m) => Object.entries(CLAIMS)
  .filter(([k]) => Number(k) <= m)
  .flatMap(([, list]) => list)
  .reduce((a, c) => a + c.approved, 0);

// Final position, exactly.
export const FINAL = { pv: 18_000_000, ev: 17_285_000, ac: 17_900_000, progress: 90 };
