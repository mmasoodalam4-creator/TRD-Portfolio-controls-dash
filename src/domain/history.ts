import type {
  EquipmentItem, Incident, ManpowerTrade, Ncr, Project, QualityInspection, Risk, ScurvePoint,
} from './types';
import { DATA_DATE_INDEX } from './forecast';
import { parseDate, REPORTING_YEAR } from './calendar';
import { isOpenNcr } from './counts';

// ==========================================================================
// THE OPERATING HISTORY
//
// The reported position is one figure per development: 267 people, 40,280
// manhours, 8 non-conformances, 23.8M of risk exposure. Every trend chart in
// the approved design needs those figures MONTH BY MONTH, and the system holds
// no such history — it holds the current position and the periods that have
// been filed, which on a new deployment is none.
//
// So the history is MODELLED from the development's own progress curve, and
// the modelling obeys one rule that makes it safe:
//
//   THE LAST POINT IS THE REPORTED POSITION, EXACTLY.
//
// Not approximately, and not a separate figure that happens to look similar.
// Every series here is scaled so that its value at the data date is the value
// the register actually carries, which means a trend chart and the KPI tile
// above it can never disagree about where the development stands today. What
// is modelled is the SHAPE of how it got there.
//
// That is a real limitation and the screens say so: each trend card carries a
// line stating the past is modelled and the last point is reported. It is
// dummy-phase data, on the owner's instruction, of exactly the kind the rest
// of the fixtures are — and it is replaced, month by month, by the periods
// people actually file. `monthsReported` says how many of those exist, so the
// day the history is real the note can come off.
//
// Deterministic: no randomness anywhere. Two loads of the same development
// produce the same curve, which is what lets the pixel gate hold it.
// ==========================================================================

export interface OperatingMonth {
  month: string;
  /** Workforce on site at the end of the month. */
  workforce: number;
  direct: number;
  indirect: number;
  labour: number;
  /** Manhours worked in the month. */
  manhours: number;
  /** Earned value per manhour, the productivity index the screens show. */
  productivity: number;
  /**
   * Non-conformances raised in the month, and closed in it.
   *
   * `null` before the register's first row — see countByMonth. Nothing
   * recorded is not the same as nothing happened.
   */
  ncrsRaised: number | null;
  ncrsClosed: number;
  /** Work inspections carried out in the month, and how many passed outright. */
  inspections: number | null;
  inspectionsPassed: number | null;
  /**
   * Inspections passed outright as a percentage of those carried out, TO DATE.
   *
   * CUMULATIVE, AND THAT IS WHAT MAKES IT TRUE. It used to be a modelled
   * figure for every month but the last, where it jumped to the register's own
   * cumulative fraction — two different definitions in one line, and a reader
   * who divided the chart's own inspections by its own non-conformances could
   * not reproduce either. On RES-01 the plotted 45% sat against 60% implied by
   * the numbers beside it, in all eight months.
   *
   * Now every point is passed-to-date over carried-out-to-date, from the two
   * counts this same row publishes. The last point equals the register's own
   * figure EXACTLY, because the parts sum to the whole — not because it is
   * special-cased.
   *
   * NULL BEFORE THE FIRST INSPECTION. A month with nothing carried out has no
   * first-time-right, and plotting 100% there states that everything passed on
   * a development where nothing was looked at. The line gaps instead.
   */
  firstTimeRight: number | null;
  /** Incidents in the month, by how serious they were. `null` before the
   *  register's first row. */
  incidents: number | null;
  recordable: number | null;
  lostTime: number | null;
  /** Risk exposure carried at the end of the month, SAR. */
  exposure: number;
  /** Equipment utilisation across the fleet, per cent. */
  utilisation: number;
}

/**
 * Place a whole count of EVENTS across weighted months so the parts sum to it
 * exactly and each month gets its weight's share of the timeline.
 *
 * WHY NOT LARGEST REMAINDER. That was the first attempt, and it fixed the
 * defect it was written for — five incidents over eight months no longer
 * rounded to nothing and dumped the leftover on the last month. It replaced it
 * with a quieter one. When the count is SMALL relative to the number of months
 * every exact share is below one, so every month floors to zero and the whole
 * count is handed out as remainders — which go, in order, to the heaviest
 * months. Four incidents over this mobilisation curve produced
 *
 *     Jan 0  Feb 0  Mar 0  Apr 0  May 1  Jun 1  Jul 1  Aug 1
 *
 * on a weighting whose lightest month is still 35% of its heaviest. Summed
 * across eight developments the corporate incident trend then ran along zero
 * until June and tripled in July — a chart reporting the arithmetic of its own
 * allocation as a safety event.
 *
 * So each event is placed at its QUANTILE of the weighted timeline: event k of
 * n goes to the month where the cumulative weight first reaches (k + 0.5)/n.
 * Events land spread through the year in proportion to the weights, the parts
 * still sum to the total exactly, and it stays deterministic — no randomness,
 * so the pixel gates hold it.
 */
function apportionCount(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  const out = weights.map(() => 0);
  if (total <= 0 || sum <= 0) return out;

  const cumulative: number[] = [];
  let running = 0;
  for (const w of weights) {
    running += w;
    cumulative.push(running / sum);
  }

  for (let k = 0; k < total; k++) {
    const q = (k + 0.5) / total;
    let i = cumulative.findIndex((c) => c >= q);
    if (i < 0) i = weights.length - 1;
    out[i] += 1;
  }
  return out;
}

/**
 * WHICH MONTH A ROW ACTUALLY HAPPENED IN — READ OFF THE ROW.
 *
 * Incidents, non-conformances and inspections all carry their own date, and
 * for a long time this module ignored all three and SPREAD the register's
 * total across the year on a progress curve instead. Two consequences, both
 * of them the chart asserting something the register never said:
 *
 *   - the shape was invented. Whatever the allocation rule, four incidents
 *     over eight months have no true monthly split unless the dates are read,
 *     and every rule leaves its own fingerprint — largest remainder pushed
 *     them all to the heaviest months, quantile placement combed them into
 *     alternating spikes because eight developments share one curve.
 *   - it was avoidable. The rows say when.
 *
 * So these series are MEASURED now, not modelled, and the trend cards no
 * longer claim otherwise. A row whose date cannot be read is counted at the
 * data date rather than dropped, because the months have to sum to the
 * register whatever the register contains.
 */
function monthOf(date: string | null | undefined, lastIndex: number): number | null {
  const t = parseDate(date);
  if (t === null) return null;
  const d = new Date(t);
  const year = d.getUTCFullYear();
  if (year < REPORTING_YEAR) return 0;
  if (year > REPORTING_YEAR) return lastIndex;
  return Math.min(lastIndex, Math.max(0, d.getUTCMonth()));
}

/**
 * NOTHING RECORDED IS NOT THE SAME AS NOTHING HAPPENED.
 *
 * Every incident, non-conformance and inspection in the shipped registers is
 * dated July or August — the registers cover two months, not eight. Counting
 * them by date and reporting the other six as ZERO would have the chart state
 * that this portfolio had no incidents in January, which is not what the
 * absence of a January row means. It means nobody recorded January.
 *
 * So the months before the register's first row are NULL and the line simply
 * begins where the record does. Every month from there on is a real count,
 * including a genuine zero — a month inside the recorded period with nothing
 * in it did have nothing in it.
 */
function countByMonth<T>(
  rows: readonly T[],
  dateOf: (row: T) => string | null | undefined,
  lastIndex: number,
): (number | null)[] {
  const counts = Array.from({ length: lastIndex + 1 }, () => 0);
  let undated = 0;
  for (const row of rows) {
    const i = monthOf(dateOf(row), lastIndex);
    if (i === null) undated += 1;
    else counts[i] += 1;
  }
  counts[lastIndex] += undated;
  const first = counts.findIndex((n) => n > 0);
  if (first < 0) return counts.map(() => null);
  return counts.map((n, i) => (i < first ? null : n));
}

/** The sum of a nested subset must gap wherever its parent does. */
const alignTo = (
  parent: readonly (number | null)[], child: readonly (number | null)[],
): (number | null)[] => parent.map((p, i) => (p === null ? null : child[i] ?? 0));

/**
 * A mobilisation curve: nothing at the start, a ramp, then a plateau.
 *
 * `at(i)` is the share of the eventual figure the development had reached in
 * month `i`. It follows the SAME progress the earned-value curve does, so a
 * development that is 67% complete shows a workforce that grew the way its
 * money did rather than on a shape of its own.
 */
function ramp(scurve: readonly ScurvePoint[], dd: number): number[] {
  const peak = scurve[dd]?.pv ?? 1;
  return scurve.slice(0, dd + 1).map((s, i) => {
    const share = peak ? (s.pv ?? 0) / peak : 0;
    // Workforce leads the money: people are on site before the value they
    // earn is certified, so the curve is flattened toward its plateau.
    return Math.min(1, 0.35 + 0.65 * Math.sqrt(Math.max(0, share)) * (i === dd ? 1 : 0.97));
  });
}

/**
 * The monthly operating history for one development.
 *
 * Every series lands on the register's own current value at the data date.
 * Where a register is empty the series is flat at zero rather than invented —
 * a development with no non-conformances recorded has a first-time-right of
 * 100%, which is true, rather than a plausible-looking 94%.
 */
export function operatingHistory(
  p: Project,
  registers: {
    manpower: readonly ManpowerTrade[];
    ncrs: readonly Ncr[];
    risks: readonly Risk[];
    equipment: readonly EquipmentItem[];
    incidents: readonly Incident[];
    qualityInspections: readonly QualityInspection[];
  },
  months: readonly string[],
  scurve: readonly ScurvePoint[],
): OperatingMonth[] {
  const dd = Math.min(DATA_DATE_INDEX, scurve.length - 1, months.length - 1);
  const shape = ramp(scurve, dd);

  const now = {
    workforce: registers.manpower.reduce((a, m) => a + m.total, 0),
    direct: registers.manpower.reduce((a, m) => a + m.direct, 0),
    indirect: registers.manpower.reduce((a, m) => a + m.indirect, 0),
    labour: registers.manpower.reduce((a, m) => a + m.labor, 0),
    manhours: registers.manpower.reduce((a, m) => a + m.hours, 0),
    exposure: registers.risks.reduce((a, r) => a + r.exposure, 0),
    utilisation: registers.equipment.length
      ? Math.round(registers.equipment.reduce((a, e) => a + e.util, 0) / registers.equipment.length)
      : 0,
  };

  const ncrsClosedTotal = registers.ncrs.filter((n) => !isOpenNcr(n)).length;

  // First-time-right comes from the INSPECTIONS register — the same rows the
  // Quality tile counts — never from a formula over the NCR count. The
  // register with no inspections has failed nothing, which is 100 and true.

  // INCIDENTS COME FROM THE REGISTER, NOT FROM A FORMULA. They were computed
  // from manhours, which produced about twenty on a development whose register
  // holds five — two counts of the same thing, and TRIR built on the wrong
  // one reported 6.20 where the rows say 1.6. The register decides how many
  // there were; the curve only decides which months they fell in.

  // Counted off the rows' own dates — see countByMonth. Only the CLOSED count
  // is still spread, because a non-conformance records when it was raised and
  // not when it was closed; it is the one series here nothing can date, and it
  // is not plotted.
  const raisedWeights = shape.map((w, i) => w * (1 + i / (dd + 1)));
  const raised = countByMonth(registers.ncrs, (n) => n.raised, dd);
  const closedSpread = apportionCount(ncrsClosedTotal, raisedWeights);
  // The three incident series are NESTED SETS — every lost-time case is
  // recordable and every recordable one is an incident. Counting each subset
  // off the same dates makes that true by construction rather than by an
  // accident of how a spread rounded.
  const incidentSpread = countByMonth(registers.incidents, (x) => x.date, dd);
  // A subset is aligned to its parent's window: recordable cases are known for
  // exactly the months incidents are known for, so the two lines start
  // together and a zero inside that window is a real zero.
  const recordableSpread = alignTo(incidentSpread, countByMonth(
    registers.incidents.filter((x) => RECORDABLE.has(x.classification)), (x) => x.date, dd,
  ));
  const lostTimeSpread = alignTo(incidentSpread, countByMonth(
    registers.incidents.filter((x) => LOST_TIME.has(x.classification)), (x) => x.date, dd,
  ));
  const inspectionsSpread = countByMonth(registers.qualityInspections, (q) => q.date, dd);
  const inspectionsPassedSpread = alignTo(inspectionsSpread, countByMonth(
    registers.qualityInspections.filter((q) => q.result === 'Passed'), (q) => q.date, dd,
  ));

  let cumulativeHours = 0;
  let cumulativePassed = 0;
  let cumulativeInspections = 0;
  return months.slice(0, dd + 1).map((month, i) => {
    const f = shape[i];
    const last = i === dd;

    // Exact at the data date; scaled by the curve before it.
    const workforce = last ? now.workforce : Math.round(now.workforce * f);
    const manhours = last ? now.manhours : Math.round(now.manhours * f);

    const ncrsRaised = raised[i];
    // Closing an NCR in a month has nothing to do with raising one in the
    // same month, so the two are no longer clamped against each other. The
    // clamp never bit on today's register — raised happens to exceed closed
    // every month — but where it did it would drop closures silently and the
    // plotted line would sum to less than the register's own closed count.
    const closed = closedSpread[i];
    const recordable = recordableSpread[i];
    const incidents = incidentSpread[i];
    const lostTime = lostTimeSpread[i];

    // Productivity is earned value per manhour, so it uses the curve's own EV
    // over the HOURS THE SERIES ITSELF HAS SHOWN — a running sum of the
    // manhours line two cards up. It used to be manhours x (i + 1), which is
    // not the sum of a ramping series: a reader dividing the chart's own EV
    // by its own hours could not reproduce the productivity plotted, which is
    // a trend drawing an artefact of its own arithmetic.
    const evAt = last ? p.ev : Math.round(p.ev * ((scurve[i]?.pv ?? 0) / (scurve[dd]?.pv || 1)));
    cumulativeHours += manhours;

    cumulativePassed += inspectionsPassedSpread[i] ?? 0;
    cumulativeInspections += inspectionsSpread[i] ?? 0;

    return {
      month,
      workforce,
      direct: last ? now.direct : Math.round(now.direct * f),
      indirect: last ? now.indirect : Math.round(now.indirect * f),
      labour: last ? now.labour : Math.round(now.labour * f),
      manhours,
      productivity: cumulativeHours ? Number((evAt / cumulativeHours).toFixed(2)) : 0,
      ncrsRaised,
      ncrsClosed: closed,
      inspections: inspectionsSpread[i],
      inspectionsPassed: inspectionsPassedSpread[i],
      // Passed to date over carried out to date, from the two counts on this
      // row. It lands on the register's own figure at the data date because
      // the parts sum to the whole, not because the last point is special.
      firstTimeRight: cumulativeInspections
        ? Number(((cumulativePassed / cumulativeInspections) * 100).toFixed(1))
        : null,
      incidents,
      recordable,
      lostTime,
      exposure: last ? now.exposure : Math.round(now.exposure * (0.72 + 0.28 * f)),
      utilisation: last ? now.utilisation : Math.round(now.utilisation * (0.78 + 0.22 * f)),
    };
  });
}

/**
 * WHICH CLASSIFICATIONS COUNT TOWARD WHICH RATE.
 *
 * A near miss and a first-aid case are recorded and are NOT recordable — that
 * is the standard definition, and getting it wrong in the generous direction
 * makes a safety record look worse than it is, which is how reporting quietly
 * stops. A restricted-work case is recordable but is not a lost-time injury:
 * the person came to work.
 */
const RECORDABLE = new Set([
  'Med. Treatment Case', 'Restricted Work Case', 'Lost Time Case',
]);
const LOST_TIME = new Set(['Lost Time Case']);

/**
 * TRIR and LTIFR, computed from the incident register rather than authored
 * beside it.
 *
 * Both are per 200,000 exposure hours, the convention this industry uses. They
 * were literals on the HSE screen — the same 0.45 and 0.31 on every
 * development, whatever its size or its incidents — which is a rate that
 * describes nothing. Computed here they move when the register does.
 */
export function safetyRates(history: readonly OperatingMonth[]): {
  trir: number; ltifr: number; hours: number; recordable: number; lostTime: number;
} {
  const hours = history.reduce((a, m) => a + m.manhours, 0);
  const recordable = history.reduce((a, m) => a + (m.recordable ?? 0), 0);
  const lostTime = history.reduce((a, m) => a + (m.lostTime ?? 0), 0);
  const per = (n: number): number => (hours ? Number(((n * 200_000) / hours).toFixed(2)) : 0);
  return { trir: per(recordable), ltifr: per(lostTime), hours, recordable, lostTime };
}

/**
 * SEVERAL DEVELOPMENTS' HISTORIES AS ONE.
 *
 * The trend charts are on modules the sidebar shows at portfolio and corporate
 * level too, so the series have to add up the same way the tiles above them
 * do. Counts and hours SUM — a portfolio worked the hours its developments
 * worked and had the incidents they had. Rates and indices cannot be summed,
 * and a flat average across developments would let a site of twelve people
 * count for as much as one of six hundred, so each is weighted by the manhours
 * behind it in that month.
 *
 * The rule the single-development history obeys survives the combination: each
 * series lands at the data date on the sum of the values the registers carry,
 * because that is what summing exact endpoints does.
 */
export function combineHistory(all: readonly OperatingMonth[][]): OperatingMonth[] {
  const live = all.filter((h) => h.length > 0);
  if (live.length === 0) return [];
  if (live.length === 1) return live[0];

  const months = Math.max(...live.map((h) => h.length));
  // First-time-right is cumulative in every single-development series, so the
  // roll-up has to accumulate too. Dividing one month's passed by one month's
  // carried out would give a portfolio a different definition from each of the
  // developments inside it, and the two lines would part company on a screen
  // that offers both.
  let seenPassed = 0;
  let seenInspections = 0;
  return Array.from({ length: months }, (_, i) => {
    const rows = live.map((h) => h[i]).filter((r): r is OperatingMonth => r !== undefined);
    const add = (pick: (m: OperatingMonth) => number): number =>
      rows.reduce((a, m) => a + pick(m), 0);
    // A roll-up month is UNRECORDED only where every development in it is.
    // One development's register beginning in July does not erase another's
    // June, and summing a gap as zero would.
    const addKnown = (pick: (m: OperatingMonth) => number | null): number | null => {
      const known = rows.map(pick).filter((v): v is number => v !== null);
      return known.length ? known.reduce((a, v) => a + v, 0) : null;
    };
    const hours = add((m) => m.manhours);
    const byHours = (pick: (m: OperatingMonth) => number): number =>
      (hours ? rows.reduce((a, m) => a + pick(m) * m.manhours, 0) / hours : 0);

    const inspections = addKnown((m) => m.inspections);
    const inspectionsPassed = addKnown((m) => m.inspectionsPassed);
    seenPassed += inspectionsPassed ?? 0;
    seenInspections += inspections ?? 0;

    return {
      month: rows[0]?.month ?? '',
      workforce: add((m) => m.workforce),
      direct: add((m) => m.direct),
      indirect: add((m) => m.indirect),
      labour: add((m) => m.labour),
      manhours: hours,
      productivity: Number(byHours((m) => m.productivity).toFixed(2)),
      ncrsRaised: addKnown((m) => m.ncrsRaised),
      ncrsClosed: add((m) => m.ncrsClosed),
      inspections,
      inspectionsPassed,
      // Passed over carried out across the whole scope. Summing the counts and
      // dividing once is the same arithmetic the Quality tile does over the
      // concatenated register, so the chart and the tile cannot disagree — and
      // unlike a weighted average of percentages it needs no explanation.
      firstTimeRight: seenInspections
        ? Number(((seenPassed / seenInspections) * 100).toFixed(1))
        : null,
      incidents: addKnown((m) => m.incidents),
      recordable: addKnown((m) => m.recordable),
      lostTime: addKnown((m) => m.lostTime),
      exposure: add((m) => m.exposure),
      utilisation: Math.round(byHours((m) => m.utilisation)),
    };
  });
}
