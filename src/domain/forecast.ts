// ==========================================================================
// COST FORECASTING
//
// Everything here forecasts what a development will finally COST the owner.
// There is no revenue side: AFC is Anticipated Final Cost, BAC is the Approved
// Development Budget, and a favourable variance means spending less than was
// authorised — never a margin.
//
// The formulas are the standard earned-value ones, applied to the project's
// own EV, AC, PV and budget. They are deliberately not tuned to agree with the
// AFC recorded against the project: the gap between what performance to date
// predicts and what management has adopted as its control position is the most
// useful number a cost-control system produces, and hiding it would make the
// forecast decorative.
//
// That gap is currently small because the underlying earned value was corrected
// to be consistent with the rest of each project's position, not because these
// formulas were bent to produce it. Feed the model an incoherent project and it
// will say so — which is the whole point.
// ==========================================================================
import type { Project, ScurvePoint } from './types.js';

/** Index of the data date within the 12-month curve (month 8, August). */
export const DATA_DATE_INDEX = 7;

/**
 * THE FIVE FIGURES A FORECAST NEEDS, and nothing else.
 *
 * Structural rather than `Project`, because a portfolio has these five as
 * honestly as a development does — they are the sums of them — while it has no
 * delivery route, no PMC and no single start date. Taking the subset is what
 * lets the Cost module forecast a portfolio without a fabricated development
 * being invented to carry the figures. See `domain/position.ts`.
 */
export type CostPosition = Pick<Project, 'budget' | 'afc' | 'ev' | 'pv' | 'actual'>;

export interface ForecastMethod {
  key: string;
  /** The formula, written the way a cost engineer would recognise it. */
  formula: string;
  /** What assumption it encodes. */
  basis: string;
  afc: number;
  /** Variance against the Approved Development Budget. Positive = under. */
  variance: number;
  confidence: 'Very High' | 'High' | 'Medium';
}

export interface ForecastResult {
  bac: number;
  ev: number;
  ac: number;
  pv: number;
  cpi: number;
  spi: number;
  methods: ForecastMethod[];
  /** Weighted blend of the methods. */
  composite: number;
  /** The AFC management has adopted as the control position. */
  adopted: number;
  /** composite − adopted. Positive means the forecast is above the adopted AFC. */
  divergence: number;
  /**
   * Cost performance required across the remaining work to land on the adopted
   * AFC. Compare against the CPI actually being achieved: a TCPI far above it
   * says the adopted position is not reachable at the current rate.
   */
  tcpiToAdopted: number;
  /** TCPI needed to finish within the Approved Development Budget. */
  tcpiToBudget: number;
  /**
   * Whether the adopted position is reachable at the cost performance being
   * achieved.
   *
   * Compared with a tolerance rather than exactly. A forecast one million above
   * a 1,480M adopted AFC is on target, not a management exception, and a strict
   * comparison flags it as one because the two numbers differ in the third
   * decimal of an index. Raising an exception for noise is how a controls
   * system trains people to ignore it.
   */
  onTarget: boolean;
}

/** A forecast within this share of the adopted AFC is on target, not an exception. */
export const FORECAST_TOLERANCE = 0.02;

/**
 * Weights for the composite, favouring the cost-performance method.
 *
 * There used to be five methods, and three of them were the same formula.
 * AC + (BAC − EV) ÷ CPI expands to BAC ÷ CPI exactly, and the "trend" method
 * — AC ÷ (EV ÷ BAC) — is BAC × AC ÷ EV, which is BAC ÷ CPI again. So one
 * formula carried 0.70 of the composite under three different confidence
 * labels, and the panel showed the same number three times with three
 * explanations. Three genuinely different methods now, weighted once.
 */
const WEIGHTS = [0.2, 0.5, 0.3];

export function forecast(p: CostPosition): ForecastResult {
  const bac = p.budget;
  const { ev, pv, actual: ac } = p;
  const cpi = ac ? ev / ac : 1;
  const spi = pv ? ev / pv : 1;
  const remaining = bac - ev;

  const raw: [string, string, string, number, ForecastMethod['confidence']][] = [
    ['optimistic', 'AFC = AC + (BAC − EV)', 'Remaining work at budgeted rates; variance to date does not recur',
      ac + remaining, 'Medium'],
    ['cost-based', 'AFC = BAC ÷ CPI', 'Cost performance to date persists to completion',
      cpi ? bac / cpi : bac, 'High'],
    ['pessimistic', 'AFC = AC + (BAC − EV) ÷ (CPI × SPI)', 'Cost and schedule pressure both persist',
      ac + (cpi * spi ? remaining / (cpi * spi) : remaining), 'Medium'],
  ];

  const methods: ForecastMethod[] = raw.map(([key, formula, basis, afc, confidence]) => ({
    key,
    formula,
    basis,
    afc: Math.round(afc),
    variance: Math.round(bac - afc),
    confidence,
  }));

  const composite = Math.round(
    methods.reduce((sum, m, i) => sum + m.afc * (WEIGHTS[i] ?? 0), 0),
  );

  const divergence = composite - p.afc;

  return {
    bac,
    ev,
    ac,
    pv,
    cpi,
    spi,
    methods,
    composite,
    adopted: p.afc,
    divergence,
    tcpiToAdopted: p.afc - ac > 0 ? remaining / (p.afc - ac) : NaN,
    tcpiToBudget: bac - ac > 0 ? remaining / (bac - ac) : NaN,
    // Both ways. A composite well BELOW the adopted figure is as much a
    // question about the adopted figure as one well above it; the one-sided
    // test called a 30% under-forecast "on target".
    onTarget: p.afc ? Math.abs(divergence) <= p.afc * FORECAST_TOLERANCE : divergence === 0,
  };
}

/**
 * The forecast for a SCOPE: each development forecast on its own figures,
 * then summed.
 *
 * NOT `forecast(agg(list))`. The cost-based method is BAC ÷ CPI, which is not
 * linear, so forecasting the summed position gives a different answer from
 * summing the forecasts — 44M different across the shipped portfolio — and
 * the Cost module did the first while Analytics did the second, so two
 * screens quoted two "Composite Forecast" figures for the same scope. Summing
 * per-development forecasts is the defensible one: each development's cost
 * performance is applied to its own remaining work, rather than one blended
 * index being applied to everybody's, and the portfolio AFC is then the sum
 * of the developments' — the same identity every other roll-up obeys.
 *
 * One development in scope returns `forecast` of it, exactly.
 */
export function forecastScope(positions: readonly CostPosition[]): ForecastResult {
  if (positions.length === 1) return forecast(positions[0]);
  if (positions.length === 0) return forecast({ budget: 0, afc: 0, ev: 0, pv: 0, actual: 0 });

  const per = positions.map(forecast);
  const sum = (pick: (f: ForecastResult) => number): number =>
    per.reduce((t, f) => t + pick(f), 0);

  const bac = sum((f) => f.bac);
  const ev = sum((f) => f.ev);
  const ac = sum((f) => f.ac);
  const pv = sum((f) => f.pv);
  const adopted = sum((f) => f.adopted);
  const composite = sum((f) => f.composite);
  const divergence = composite - adopted;
  const remaining = bac - ev;

  const methods: ForecastMethod[] = (per[0]?.methods ?? []).map((m, i) => {
    const afc = sum((f) => f.methods[i]?.afc ?? 0);
    return { ...m, afc, variance: Math.round(bac - afc) };
  });

  return {
    bac,
    ev,
    ac,
    pv,
    cpi: ac ? ev / ac : 1,
    spi: pv ? ev / pv : 1,
    methods,
    composite,
    adopted,
    divergence,
    tcpiToAdopted: adopted - ac > 0 ? remaining / (adopted - ac) : NaN,
    tcpiToBudget: bac - ac > 0 ? remaining / (bac - ac) : NaN,
    onTarget: adopted ? Math.abs(divergence) <= adopted * FORECAST_TOLERANCE : divergence === 0,
  };
}

// -------------------------------------------------------------- monthly cost

export interface MonthlyCostPoint {
  month: string;
  /** Cumulative planned value. Runs the full period. */
  plannedCum: number;
  /** Cumulative earned value and actual cost. Null past the data date. */
  earnedCum: number | null;
  actualCum: number | null;
  /** In-month movement, which is what the cost trend bars show. */
  plannedMonth: number;
  earnedMonth: number | null;
  actualMonth: number | null;
}

/**
 * A project's monthly cost position, shaped by the corporate curve.
 *
 * Scaled to pass through the project's own figures exactly: cumulative PV, EV
 * and AC at the data date equal the project's pv, ev and actual, and planned
 * value at completion equals the Approved Development Budget. Both ends are
 * pinned because both are printed elsewhere on the same screen — the curve has
 * to agree with the KPI row above it and the budget in the project band.
 */
export function monthlyCost(
  p: CostPosition, months: string[], scurve: ScurvePoint[],
): MonthlyCostPoint[] {
  const dd = Math.min(DATA_DATE_INDEX, scurve.length - 1);
  const basePv = scurve[dd]?.pv ?? 1;
  const baseEv = scurve[dd]?.ev ?? 1;
  const baseAc = scurve[dd]?.ac ?? 1;

  const pvToDate = basePv ? p.pv / basePv : 0;
  const evScale = baseEv ? p.ev / baseEv : 0;
  const acScale = baseAc ? p.actual / baseAc : 0;

  // Planned value: scaled to hit p.pv at the data date, then interpolated on to
  // the Approved Development Budget at completion.
  const tailStart = scurve[dd]?.pv ?? 0;
  const tailEnd = scurve[scurve.length - 1]?.pv ?? tailStart;
  const tailSpan = tailEnd - tailStart;

  const rows = months.map((month, i) => {
    const s = scurve[i];
    const plannedCum = i <= dd
      ? Math.round((s?.pv ?? 0) * pvToDate)
      : Math.round(p.pv + (tailSpan ? ((s?.pv ?? 0) - tailStart) / tailSpan : 0) * (p.budget - p.pv));

    const earnedCum = i <= dd && s?.ev != null ? Math.round(s.ev * evScale) : null;
    const actualCum = i <= dd && s?.ac != null ? Math.round(s.ac * acScale) : null;

    return { month, plannedCum, earnedCum, actualCum };
  });

  return rows.map((r, i) => {
    const prev = rows[i - 1];
    return {
      ...r,
      plannedMonth: r.plannedCum - (prev?.plannedCum ?? 0),
      earnedMonth: r.earnedCum === null ? null : r.earnedCum - (prev?.earnedCum ?? 0),
      actualMonth: r.actualCum === null ? null : r.actualCum - (prev?.actualCum ?? 0),
    };
  });
}
