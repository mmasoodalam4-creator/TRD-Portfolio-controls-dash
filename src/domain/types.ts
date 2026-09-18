// ==========================================================================
// TAZAYUD OWNER PMO — DOMAIN TYPES
//
// Tazayud is a real-estate developer / owner / operator, NOT a contractor.
// It delivers through PMC-Delivered or Self-Execution routes; contractors do
// the physical work.
//
// Therefore: every contract value modelled here is a COST or commitment to
// the owner — never revenue. There is deliberately no Gross Profit, Gross
// Margin, Contractor Revenue or Budget Headroom in this type system, and
// scripts/check-domain-rules.mjs fails the build if such language appears.
//
// Manpower and Equipment carry availability and utilisation only. No labour
// rates, no equipment cost — those are the contractor's concern, not the
// owner's control system.
// ==========================================================================

/**
 * A portfolio, by name.
 *
 * A STRING, not a union of four, since `db/migrations/017`: portfolios are
 * rows an administrator adds and removes from the Administration screen, so a
 * closed set here would make a fifth one a code change — which is the thing
 * that feature exists to remove. What the product ships with, and the colour
 * each is drawn in, are in `domain/portfolios.ts`; what a deployment actually
 * holds is in the `portfolios` table and travels with the corporate data.
 *
 * The name is kept as an alias rather than replaced with `string` everywhere
 * because it still says what the field MEANS at every use, which is most of
 * what the union was doing.
 */
export type Portfolio = string;

/** How the owner delivers the work. A row in `delivery_routes`, by name. */
export type DeliveryRoute = string;

export type ProjectStatus = 'On Track' | 'At Risk' | 'Delayed';

/**
 * Free-form status label rendered by Badge. Registers use vocabularies of
 * their own (Approved / Under Review / Overdue / Operating / …); constraining
 * them to one union would fight the data without protecting anything.
 */
export type StatusLabel = string;

export type Role =
  | 'Owner Admin' | 'PMO Director' | 'Portfolio Manager'
  | 'Project Manager' | 'PMC User' | 'Executive Viewer';

// -------------------------------------------------------------- scope

export type ScopeLevel = 'Corporate' | 'Portfolio' | 'Project';

/**
 * The single control that re-cuts the whole system. Every roll-up on every
 * screen derives from this plus the project list — there is no second source.
 */
export interface Scope {
  level: ScopeLevel;
  portfolio: Portfolio;
  project: string;
}

// -------------------------------------------------------------- project

/**
 * A development. All monetary fields are SAR and all are owner-side costs:
 *
 *   budget      Approved Development Budget
 *   control     Control Budget
 *   committed   Committed Cost (contracts awarded)
 *   actual      Actual Cost (AC)
 *   ev / pv     Earned Value / Planned Value
 *   afc         Anticipated Final Cost
 *   paid        Contractor Payments Made to Date
 *   ipcSubmitted  IPC value submitted to the owner
 *   emv         Expected Monetary Value of the risk exposure
 */
export interface Project {
  id: string;
  name: string;
  portfolio: Portfolio;
  route: DeliveryRoute;
  pmc: string;
  budget: number;
  control: number;
  afc: number;
  committed: number;
  actual: number;
  ev: number;
  pv: number;
  spi: number;
  cpi: number;
  progress: number;
  status: ProjectStatus;
  start: string;
  finish: string;
  duration: string;
  paid: number;
  ipcSubmitted: number;
  risks: number;
  highRisks: number;
  openNcr: number;
  openIssues: number;
  emv: number;
  /**
   * Taken out of the portfolio, its history kept. Absent on every development
   * that is in it, so the field never appears in the seeded figures and the
   * parity snapshot is untouched.
   */
  archived?: boolean;
  /**
   * When it was taken out, and when its retention window closes.
   *
   * Both absent on a development that is in the portfolio, and both absent on
   * one archived before retention existed — an archive with no window is one
   * that never expires, which is exactly what those acts meant. See
   * `domain/retention.ts`.
   */
  archivedAt?: string;
  retainUntil?: string;
  /**
   * DELIVERED AND CLOSED OUT — the date the final account was agreed.
   *
   * This is not `archived` and the difference is the whole point. Archiving
   * says a development should never have counted: it is cancelled, it leaves
   * every screen, and it is found again only by the seat that put it away.
   * Closing says the opposite — it counted, it finished, and its figures are
   * now the record of what the owner actually spent.
   *
   * So a closed development stays visible and readable everywhere, with its
   * registers, its documents and its audit trail, and is frozen: no period, no
   * certificate, no claim, no variation and no amendment is accepted against
   * it. What it leaves is the CONTROL arithmetic — the portfolio a PMO is
   * still steering — because forecasting a building that is finished, or
   * counting it as "on track", says nothing about anything.
   *
   * Absent while a development is live, for the same reason `archived` is:
   * the seeded figures and the parity snapshot stay exactly as they were.
   */
  closedAt?: string;
  /** The closeout record: final account reference, board decision, whatever was agreed. */
  closeNote?: string;
}

// -------------------------------------------------------------- registers

/** Work package. `level` drives the indent in the WBS tree. */
export interface WbsNode {
  code: string;
  name: string;
  budget: number;
  pv: number;
  ev: number;
  ac: number;
  prog: number;
  spi: number;
  cpi: number;
  status: StatusLabel;
  level: number;
}

/** A development cost category. `varc` is Budget Variance in SAR. */
export interface CostCategory {
  cat: string;
  budget: number;
  committed: number;
  actual: number;
  ev: number;
  afc: number;
  varc: number;
  varpct: number;
  status: StatusLabel;
}

/** Contractor variation order — an addition to owner cost. */
export interface Variation {
  no: string;
  title: string;
  /**
   * The contract package the variation is against.
   *
   * A variation is always a change to somebody's contract, and without saying
   * whose it is there is no way to tell which counterparty keeps coming back
   * for more money — which is the cost question an owner actually has.
   */
  packageId: string;
  type: string;
  cat: string;
  date: string;
  by: string;
  impact: string;
  amount: number;
  status: StatusLabel;
  desc: string;
  docs: string[];
}

/** Change request, upstream of a variation. */
export interface ChangeRequest {
  no: string;
  title: string;
  cat: string;
  date: string;
  impact: string;
  amount: number;
  status: StatusLabel;
  by: string;
  desc: string;
  docs: string[];
}

/**
 * What a counterparty is engaged as. Kept separate from the package category
 * because "MEP" describes the scope and "Trade Contractor" describes the
 * relationship, and the evaluation scorecard reads the second.
 */
export type CounterpartyRole =
  | 'Main Contractor' | 'Trade Contractor' | 'Supplier'
  | 'PMC' | 'Design Consultant' | 'Verification Consultant';

/**
 * A contract package: one slice of scope, one counterparty.
 *
 * `value` and `committed` are owner commitments — costs, never a sale value.
 *
 * A development has several of these, which is the point: the owner contracts
 * the work out in packages and each package has exactly one counterparty. Two
 * packages may sit under the same WBS node — substructure bought as excavation
 * and concrete, say — and that is normal. What must never happen is two
 * counterparties on one package, because then no figure on this row belongs to
 * anybody in particular.
 *
 * `awarded` is null while the package is out to tender. Such a package has a
 * `value` estimate and a place in the AFC but contributes **nothing** to
 * committed cost, because nobody has been promised anything yet. Control 7
 * sums `committed`, so a tendered package cannot inflate the obligation.
 */
export interface ProcurementPackage {
  id: string;
  name: string;
  cat: string;
  type: string;
  contractor: string;
  /** How the counterparty is engaged. */
  role: CounterpartyRole;
  /** The WBS level-1 node this package sits under. */
  wbs: string;
  value: number;
  committed: number;
  paid: number;
  /**
   * The retention percentage in this package's payment terms. It is the
   * DEFAULT a payment claim starts from, never the rate a claim must use —
   * terms differ between claims, so the claim decides.
   */
  retention: number;
  /** ISO date of award, or null while the package is out to tender. */
  awarded: string | null;
  prog: number;
  status: StatusLabel;
}

/**
 * The counterparty name on the one register row that has no counterparty.
 *
 * A development registered through the app can report committed cost the
 * period states before every contract behind it has been registered. That
 * difference is carried as ONE explicit row — the same pattern as the
 * "Unallocated" WBS package — rather than being spread invisibly across the
 * contracts that do exist, which would misstate every one of them. The
 * evaluation scorecard skips this name: it is an absence of a counterparty,
 * not a counterparty to be scored.
 */
export const UNPACKAGED_COMMITMENTS = 'Not yet packaged';

/**
 * Where a payment claim has reached.
 *
 * The order is the order it moves in, and each step is somebody's act:
 * the contractor raises it, the consultant verifies it, Tazayud approves it,
 * and the money leaves. Nothing skips a step.
 */
export type ClaimState =
  | 'With consultant' | 'With approver' | 'Approved' | 'Part paid' | 'Paid';

/**
 * A contractor's invoice against a delivered milestone.
 *
 * Payment is milestone-based, not monthly: the contractor delivers a
 * milestone and claims for it. The consultant verifies what was delivered —
 * recorded here as a fact with a name, a date and a reference, because the
 * consultant does not hold an account in this system — and Tazayud then
 * approves an amount and withholds a percentage of it as security.
 *
 * `retentionRate` is a percentage of THIS CLAIM, not of the contract. It
 * starts from the rate in the package's payment terms and is set on every
 * claim, because terms differ between claims. There is no
 * percentage-of-contract ceiling. Retention is released at handover and
 * closeout, which is why `retention` still stands against a claim that has
 * been paid in full.
 *
 * `claimed` is what the contractor asked for; `verified` is what the
 * consultant measured; `approved` is what Tazayud accepted. The three differ,
 * and the difference between the first and the last is what the evaluation
 * scorecard reads as claim accuracy.
 */
export interface PaymentClaim {
  id: string;
  /** The contract package this claim is against. */
  packageId: string;
  contractor: string;
  /** The delivered milestone being claimed for. */
  milestone: string;
  raised: string;
  /** Gross amount claimed by the contractor. */
  claimed: number;
  verifiedBy: string | null;
  verifiedOn: string | null;
  verifiedRef: string | null;
  /** What the consultant measured as delivered, or null until verified. */
  verified: number | null;
  /** What Tazayud accepted, or null until approved. */
  approved: number | null;
  /** Percentage withheld from THIS claim. */
  retentionRate: number;
  /** Amount withheld from this claim as security. */
  retention: number;
  /** How much of that retention has since been returned to the counterparty. */
  released: number;
  /** Transferred to the counterparty against this claim. */
  paid: number;
  paidOn: string | null;
  state: ClaimState;
}

/**
 * Workforce availability and productivity by trade.
 * Headcount, hours and a productivity index only — no rates, no cost.
 */
export interface ManpowerTrade {
  trade: string;
  type: string;
  direct: number;
  indirect: number;
  labor: number;
  total: number;
  hours: number;
  prod: number;
  varpct: string;
  status: StatusLabel;
}

/** Plant deployment and utilisation. `util` is a percentage. No cost. */
export interface EquipmentItem {
  id: string;
  name: string;
  cat: string;
  type: string;
  model: string;
  loc: string;
  status: StatusLabel;
  util: number;
  /**
   * When it was last serviced and when it is next due.
   *
   * Optional because a development registered from the new-development
   * workbook has no equipment register at all, and a machine somebody has just
   * added has no service history. Absent reads as "not recorded" rather than
   * as a date, which is the difference between a maintenance schedule and a
   * guess about one.
   */
  lastService?: string;
  nextService?: string | null;
}

/** Non-conformance report. */
export interface Ncr {
  no: string;
  title: string;
  /**
   * The contract package the non-conformance was raised against.
   *
   * Without it a non-conformance names a person and nothing else, and quality
   * cannot be attributed to the counterparty whose work it was — which is the
   * difference between an evaluation score that is measured and one that is
   * asserted.
   */
  packageId: string;
  discipline: string;
  type: string;
  severity: string;
  raised: string;
  due: string;
  status: StatusLabel;
  resp: string;
  loc: string;
  desc: string;
  docs: string[];
}

/** Risk register entry. `exposure` is the expected monetary value in SAR. */
export interface Risk {
  id: string;
  desc: string;
  cat: string;
  impact: string;
  prob: string;
  score: number;
  level: string;
  exposure: number;
  owner: string;
  status: StatusLabel;
}

/**
 * THE OPERATIONAL REGISTERS BEHIND THE QUALITY, HSE, MANPOWER, EQUIPMENT AND
 * RISK MODULES.
 *
 * The approved design gives each of those modules sub-tabs that open a real
 * register: what was inspected, what was found, what was done about it, who
 * was on site and what plant was down. These are the types behind them.
 *
 * They carry NO MONEY, deliberately. Every riyal in this system reaches the
 * position through one road — packages, certificates, claims and the period —
 * and a second road through an operational register would be a way to move a
 * figure without the review it exists to pass. A corrective action costs
 * something; what it costs arrives as a variation, not as a field here.
 *
 * WHERE A SOURCE ALREADY EXISTS, THESE ARE DERIVED FROM IT RATHER THAN
 * AUTHORED BESIDE IT. A corrective action answers a real NCR by its number, a
 * mitigation answers a real risk by its id, and the attendance weeks are the
 * manpower register's own hours split across the month. Authoring them
 * separately would let the two disagree, which is the whole class of defect
 * this system exists to catch.
 */

/**
 * What was directed after a non-conformance, and whether it worked.
 *
 * `ncr` is the non-conformance this answers, by its number. An action closes
 * only when `verification` records that somebody checked it: an NCR marked
 * closed with nothing verified means it was filed away, not fixed, and a
 * first-time-right figure built on those is a measure of paperwork.
 */
export interface CorrectiveAction {
  id: string;
  ncr: string;
  action: string;
  owner: string;
  due: string;
  status: StatusLabel;
  /** Null until somebody has confirmed the action worked. */
  verification: string | null;
}

/**
 * What is being done about a risk, by whom and by when.
 *
 * `risk` is the register entry this answers. `residual` is the score its owner
 * expects once the response is delivered — a TARGET, not a calculation. The
 * register's own score moves only when somebody re-scores the risk; a system
 * that lowered it because a plan had been typed would report risk as managed
 * the moment it was written down.
 */
export interface Mitigation {
  risk: string;
  response: string;
  owner: string;
  due: string;
  status: StatusLabel;
  /** The score today, and what the owner expects it to become. */
  score: number;
  residual: number;
}

/**
 * One week of attendance inside the reporting month.
 *
 * `worked` across the weeks sums to the manpower register's own manhours,
 * because it is that figure split rather than a second count of it. Absence is
 * what the plan did not get, and overtime is already inside `worked`.
 */
export interface AttendanceWeek {
  week: string;
  planned: number;
  worked: number;
  productive: number;
  overtime: number;
}

/**
 * The workforce a counterparty is actually supplying.
 *
 * Derived by attributing each trade in the manpower register to the package
 * that bought it, so headcount and hours tie to the manpower register exactly.
 * Attribution is what separates a measured evaluation score from an asserted
 * one: a shortfall that belongs to nobody is a complaint.
 */
export interface WorkforceByParty {
  contractor: string;
  scope: string;
  headcount: number;
  hours: number;
  status: StatusLabel;
}

/**
 * A safety event, however small.
 *
 * NEAR MISSES ARE IN THIS REGISTER and that is the point of it. A register
 * that holds only injuries reports the past; one that holds the events which
 * hurt nobody is the only warning an owner gets in advance. `daysLost` is zero
 * for most of them, and `classification` is what decides whether an event
 * counts toward TRIR or LTIFR — those rates are computed from these rows and
 * never typed.
 */
export interface Incident {
  id: string;
  date: string;
  /** Near Miss · First Aid Case · Med. Treatment Case · Restricted Work Case · Lost Time Case. */
  classification: string;
  severity: string;
  location: string;
  what: string;
  daysLost: number;
  status: StatusLabel;
  investigatedBy: string;
}

/** Something somebody saw on site — a hazard, or a job done properly. */
export interface Observation {
  id: string;
  date: string;
  category: string;
  /** Unsafe Act · Unsafe Condition · Safe Act. Good practice is recorded too. */
  type: string;
  location: string;
  what: string;
  raisedBy: string;
  status: StatusLabel;
}

/** A planned HSE inspection and what it found. */
export interface HseInspection {
  id: string;
  date: string;
  area: string;
  location: string;
  /** Compliant · Minor NC · Major NC. A major one stops the activity. */
  result: string;
  findings: number;
  inspector: string;
}

/**
 * Who must hold a certificate and who does.
 *
 * Derived from the manpower register: the courses required follow the trades
 * actually on site, so a development with no steel erectors is not measured
 * against a working-at-height requirement it does not have.
 */
export interface TrainingCourse {
  course: string;
  whoNeedsIt: string;
  required: number;
  completed: number;
}

/** Permits to work issued in the month, and what happened to them. */
export interface Permit {
  type: string;
  where: string;
  issued: number;
  active: number;
  closed: number;
  rejected: number;
}

/**
 * An inspection carried out on the work itself, as opposed to on safety.
 *
 * FAILURES ARE THE NON-CONFORMANCES THAT EXIST. The count of failed
 * inspections equals the NCR register, because a failed inspection is what
 * raises one — so first-time-right cannot be quoted from a number nobody can
 * trace back to a defect.
 */
export interface QualityInspection {
  id: string;
  date: string;
  activity: string;
  discipline: string;
  location: string;
  /** Passed · Passed with comments · Failed. */
  result: string;
  inspector: string;
  /** The non-conformance this failure raised, where it failed. */
  ncr: string | null;
}

/** A material submitted for approval before it may be installed. */
export interface MaterialApproval {
  id: string;
  material: string;
  supplier: string;
  submitted: string;
  /** Approved · Approved with comments · Rejected · Under Review. */
  decision: string;
  decided: string | null;
}

/**
 * What the workforce is planned to be, against what it is.
 *
 * The plan is the figure the workforce is MEASURED AGAINST — without it,
 * "267 on site" is a number with nothing to fail. The forward months are a
 * forecast: they carry no approval and move nothing on the dashboard.
 */
export interface ResourcePlanRow {
  trade: string;
  planned: number;
  actual: number;
  /** The three months ahead. */
  forecast: number[];
  /** Ramping up · Steady · Demobilising, from the forecast's own direction. */
  direction: string;
}

/** Maintenance due or overdue on a machine in the equipment register. */
export interface MaintenanceJob {
  equipmentId: string;
  equipment: string;
  work: string;
  lastService: string;
  nextDue: string;
  status: StatusLabel;
  provider: string;
}

/** Live issue. `cost` is the owner cost impact where quantified. */
export interface Issue {
  id: string;
  desc: string;
  priority: string;
  owner: string;
  opened: string;
  cost: number;
  days: number;
  status: StatusLabel;
}

// -------------------------------------------------------------- corporate

/** One month of the corporate earned-value curve. */
export interface ScurvePoint {
  month: string;
  pv: number;
  /** null once the curve runs past the data date. */
  ev: number | null;
  ac: number | null;
}

export interface ActivityEntry {
  icon: string;
  title: string;
  sub: string;
  time: string;
}

/**
 * One cross-module reconciliation control. The integrity engine passes when
 * every control's two independent sources agree.
 */
export interface ReconciliationControl {
  no: number;
  name: string;
  a: number;
  b: number;
  result: string;
}

export interface ReportDefinition {
  name: string;
  icon: string;
}

export interface NotificationItem {
  type: 'red' | 'amber' | 'blue';
  title: string;
  sub: string;
  time: string;
}

/** Portfolio/corporate roll-up derived from a set of in-scope projects. */
export interface Aggregate {
  budget: number;
  /** The part of the budget already broken into packages. */
  control: number;
  afc: number;
  variance: number;
  paid: number;
  /** Certified to date — `ipcSubmitted` summed. */
  certified: number;
  committed: number;
  ev: number;
  pv: number;
  ac: number;
  spi: number;
  cpi: number;
  count: number;
  onTrack: number;
  atRisk: number;
  delayed: number;
  // No counts of risks, open non-conformances or open issues. They were summed
  // here from the stored project fields, which disagree with the registers
  // beneath them on all eight developments — see `domain/counts.ts`. A count
  // is the length of a list, so it is taken from the list: `registerCounts`
  // over the registers in scope. Money rolls up from the project record
  // because that is where money is reported; counts do not.
  emv: number;
}

// -------------------------------------------------------- period entry
//
// The shape of a reporting period as PT_TEMPLATE collects it. These live in
// the domain rather than the data layer because they are part of the model,
// not of how it is stored: the entry screen reads them, the mutation carries
// them, and the server validates them. Putting them behind the data boundary
// would have forced the screen to reach across it.

/** One row of the template's section 4 work-package register. */
/**
 * One awarded or tendered package, as the new-development workbook gives it.
 *
 * Lives with the model rather than with the change log because it describes a
 * contract, and both the screens and the mutation that carries them need it.
 */
export interface ContractInput {
  id: string;
  name: string;
  wbs: string;
  contractor: string;
  role: CounterpartyRole;
  value: number;
  /** The default retention rate in the payment terms, as a percentage. */
  retention: number;
  /** ISO date, or null while out to tender. A tendered package commits nothing. */
  awarded: string | null;
}

export interface PackageInput {
  /** WBS code, e.g. "3.1". */
  code: string;
  name: string;
  phase: string;
  /** Package Budget (BAC) in whole SAR. */
  budget: number;
  /** Planned and actual completion, 0..1. */
  plannedPct: number;
  actualPct: number;
  /** Cost incurred and committed to contractors, in whole SAR. */
  cost: number;
  committed: number;
}

/** One row of the template's section 5 development cost categories. */
export interface CategoryInput {
  cat: string;
  budget: number;
  committed: number;
  actual: number;
  /** Forecast final cost for the category. */
  afc: number;
}
