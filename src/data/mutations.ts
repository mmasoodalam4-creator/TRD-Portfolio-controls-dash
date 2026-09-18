// ==========================================================================
// MUTATIONS
//
// Actions the demo used to simulate — creating an IPC, approving a variation,
// registering a development — now change the data.
//
// Every mutation is written to preserve the reconciliation invariants. A
// payment that raised the project's Payments Made without moving the
// procurement register would leave the two disagreeing, and the integrity
// engine would report it on the next open. That would be the engine working
// correctly, and a defect in the mutation.
//
// Mutations are recorded as a log rather than applied destructively. The log is
// the audit trail the product claims, it replays deterministically over the
// fixtures, and it makes "reset the demo" a matter of dropping it.
// ==========================================================================
import type {
  CategoryInput, ContractInput, DeliveryRoute, PackageInput, Portfolio, Project,
} from '@/domain/types';
// Relative, not '@/domain/calc': the server imports this module, and the
// serverless bundler does not resolve path aliases. check-bundle.mjs caught
// this exact line one commit after the guard was written.
import { positionFromPackages, reportedStatus, retentionOf } from '../domain/calc.js';
import { defaultPartner } from '../domain/portfolios.js';
import { parseDate } from '../domain/calendar.js';

export interface CreateIpcMutation {
  kind: 'ipc';
  at: string;
  projectId: string;
  /** Gross certified value of the certificate, in SAR. */
  certified: number;
  /** Retention withheld by the owner, in SAR. */
  retention: number;
  reference: string;
}

/**
 * A payment claim, approved and recorded.
 *
 * The whole act in one change: what the contractor claimed against which
 * milestone, who verified it and for how much, what Tazayud approved, and the
 * retention rate withheld from THIS claim. Certified moves by the approved
 * amount; paid moves by the net.
 *
 * Stricter than `ipc`, the certificate kind it supersedes. A certificate may
 * be recorded by the contributor assigned to the development; a claim carries
 * an approval, and approving is the approver's act.
 *
 * `retentionRate` is a percentage rather than an amount on purpose: the amount
 * is then arithmetic the system does, not a second figure a person can type
 * inconsistently with the first.
 */
export interface RecordClaimMutation {
  kind: 'claim:record';
  at: string;
  projectId: string;
  /** The contract package claimed against. */
  packageId: string;
  milestone: string;
  /** Gross claimed by the contractor. */
  claimed: number;
  /** The consultant's verification, recorded as a fact. */
  verifiedBy: string;
  verifiedOn: string;
  verifiedRef: string;
  verified: number;
  /** What Tazayud accepted. */
  approved: number;
  /** Percentage withheld from this claim. */
  retentionRate: number;
  reference: string;
}

/**
 * MONEY LEFT THE ACCOUNT.
 *
 * The one act in the whole system that says a contractor has actually been
 * paid, and on the owner's instruction it belongs to the PMO manager alone.
 *
 * Nothing else says it. A certificate and a claim both move `paid` because
 * both are cash events with a payment inside them, but a claim that is
 * APPROVED and not yet transferred had no way to become paid afterwards — the
 * register simply showed it as approved for ever, and the only way to move the
 * cash position was to record another claim, which would certify the work
 * twice.
 *
 * It moves `paid` AND NOTHING ELSE. Not certified: the work was certified when
 * the claim was approved, and moving it again here would count the same
 * milestone twice against the same budget. Not earned value, not actual cost —
 * those come from the reporting period, as they do everywhere.
 *
 * `claimId` IS A REFERENCE, NOT A KEY. The claims register is derived from the
 * development's own position — approvals sum to certified, transfers sum to
 * paid, and the money is applied to the oldest unpaid claim first, which is
 * what a payment run actually does. So this records which claim the treasury
 * says it settled, for the audit trail, and the register decides where the
 * money lands. Storing a per-claim paid figure instead would let a claim be
 * paid an amount its own arithmetic does not produce, which is the defect
 * `deriveClaims` exists to prevent.
 *
 * Control 14 bounds it: paid may never exceed certified. A transfer larger
 * than what has been certified is refused by the server before the write, with
 * that sentence, rather than accepted and reported.
 */
export interface ConfirmPaymentMutation {
  kind: 'claim:pay';
  at: string;
  projectId: string;
  /** The claim the treasury says this transfer settled. */
  claimId: string;
  /** Net transferred, whole SAR. Approved less the retention withheld. */
  amount: number;
  /** The date the money left, as stated on the transfer. */
  valueDate: string;
  /** Bank or treasury reference. */
  reference: string;
}

/**
 * RECORD A CONTRACT PACKAGE AFTER REGISTRATION, or award one that was
 * registered out to tender.
 *
 * Registration was the only door contracts had — `project:create` carried
 * them, and a development that later bought another slice of scope had no way
 * to say so. That was the next dead end a real user hits: the owner contracts
 * work out in packages over the life of a development, not on day one.
 *
 * One shape, two acts, decided by the package number:
 *
 *   - a NEW id appends a row to the procurement register — out to tender when
 *     `awarded` is null (an estimate, committing nobody), or awarded;
 *   - an EXISTING id that is still out to tender is AWARDED: the row is
 *     replaced by this one, so the award can carry the real value and the
 *     real counterparty rather than the tender estimate. A package that is
 *     already awarded is refused — an award is a promise, and correcting one
 *     is a story for the audit trail, not a silent overwrite.
 *
 * Only an award moves committed cost, exactly as at registration: a tender
 * promises nobody anything, and control 7 sums what was promised.
 */
export interface AwardContractMutation {
  kind: 'contract:award';
  at: string;
  projectId: string;
  contract: ContractInput;
}

export interface ApproveVariationMutation {
  kind: 'variation:approve';
  at: string;
  projectId: string;
  no: string;
}

export interface CreateProjectMutation {
  kind: 'project:create';
  at: string;
  project: {
    id: string;
    name: string;
    portfolio: Portfolio;
    route: DeliveryRoute;
    budget: number;
  };
  /**
   * The work breakdown, when the development was registered from the workbook
   * rather than from the four headline fields.
   *
   * Their budgets become the CONTROL budget, because the control budget is
   * exactly the part of the approved budget that has been broken into
   * packages. What is left over is the contingency — that is the definition,
   * not an assumption, and it is why registering from a workbook produces a
   * development whose first control already reconciles.
   */
  packages?: PackageInput[];
  /** What has been awarded, and to whom. Only awarded rows reach committed cost. */
  contracts?: ContractInput[];
}

/**
 * Take a development out of the portfolio without losing what it did.
 *
 * Archiving hides it from every screen, every roll-up and every control, and
 * keeps its position, its registers and its whole audit trail. It is
 * reversible by the same seats that may archive.
 */
export interface ArchiveProjectMutation {
  kind: 'project:archive';
  at: string;
  projectId: string;
  /** Why it was taken out of the portfolio. Required. */
  note: string;
  /**
   * HOW LONG IT IS KEPT BEFORE IT CAN BE REMOVED FOR GOOD.
   *
   * On the owner's instruction the system asks, and will not accept less than
   * thirty days. Inside the window the same seats put it back in one click;
   * outside it, restoring is refused and an administrator may purge it. See
   * `domain/retention.ts` for why nothing expires on a timer.
   *
   * Optional on the TYPE and required by the route, because the change log
   * holds acts filed before retention existed and a replay must still read
   * them. An archive with no window never expires, which is what those acts
   * meant when they were filed.
   */
  retainDays?: number;
}

/**
 * Correct a development's DETAILS.
 *
 * The system was seeded with placeholder names so it could be demonstrated
 * before the real portfolio existed. Replacing them had meant a migration,
 * which puts the owner's own data behind a developer — so this is the act that
 * lets the register be corrected from the tool: the name it is known by, the
 * portfolio it belongs to, how it is delivered, who manages it, and the
 * authorised budget.
 *
 * What it deliberately CANNOT touch is the reported position — actual cost,
 * earned value, certified, paid, the AFC. Those are the product of periods and
 * certificates that were entered, reviewed and approved, and an edit form that
 * could overwrite them would be a way around the whole workflow. Every field
 * here is a description of the development; none of them is a measurement of
 * it.
 *
 * A field left undefined is left alone, so correcting a spelling does not
 * require restating the budget.
 */
export interface UpdateProjectMutation {
  kind: 'project:update';
  at: string;
  projectId: string;
  name?: string;
  portfolio?: Portfolio;
  route?: DeliveryRoute;
  /** The PMC or the internal team managing delivery. */
  pmc?: string;
  /** The Approved Development Budget, in whole riyals. */
  budget?: number;
  /**
   * The programme: planned start and planned finish. Description, not
   * measurement — the dates the owner authorised, which the reporting
   * calendar is then cut against. A registered development arrives with both
   * "To be confirmed", and until this carried them there was no way to state
   * them from the tool: the workspace's year strip could not reach the year
   * the job actually started, and a period could never be reported as past
   * the planned completion, because no screen knew when that was.
   */
  start?: string;
  finish?: string;
  /** Why it was corrected. Required — this is an amendment to the record. */
  note: string;
}

/** Put a deleted development back into the portfolio. */
export interface RestoreProjectMutation {
  kind: 'project:restore';
  at: string;
  projectId: string;
  /**
   * Why it is coming back.
   *
   * Optional on the type for the reason `retainDays` is — entries filed
   * before it existed must still replay — and asked for by every screen that
   * offers the act. A development that left the portfolio and returned is a
   * decision somebody made twice, and the second half of that story is worth
   * as much as the first.
   */
  note?: string;
}

/**
 * CLOSE A DEVELOPMENT OUT — delivered, final account agreed, finished.
 *
 * The act this system was missing. Until now a development could only be live
 * or archived, and archiving is for something CANCELLED: it leaves every
 * screen and has to be hunted for. A finished development is the opposite kind
 * of thing — it is the record of what the owner actually built and actually
 * spent, and it should be as easy to read a year later as it was the week it
 * completed.
 *
 * So closing does exactly two things:
 *
 *   * It FREEZES the development. No period, no certificate, no claim, no
 *     variation and no amendment is accepted against it afterwards, which is
 *     what makes the closing figures final rather than merely current. Refused
 *     server-side in `mayMutate`, so it holds whatever the browser does.
 *   * It takes the development OUT OF THE CONTROL ARITHMETIC — the portfolio
 *     KPIs, the roll-ups, the forecast. Not out of the system: every screen
 *     still shows it, scoped to it, exactly as before, marked closed.
 *
 * The reconciliation controls keep running over it, deliberately. A frozen
 * development whose registers stopped agreeing with its position would mean
 * the record of a finished job had rotted, and that is worth knowing.
 *
 * `at` is the closeout date. The note is the closeout record — the final
 * account reference, the board's decision, whatever was actually agreed — and
 * it is required, because a closure with no reason recorded is the one entry
 * in this log nobody will be able to explain later.
 */
export interface CloseProjectMutation {
  kind: 'project:close';
  at: string;
  projectId: string;
  /** The closeout record. Required. */
  note: string;
}

/**
 * Reopen a closed development.
 *
 * Closing is a judgement, and judgements are occasionally wrong: a defect
 * comes back, a final account is reopened, a retention release turns out to
 * have been missed. Reopening puts the development back into the portfolio
 * and back into the roll-ups, and both acts are in the change log — so the
 * question "why did this one close twice?" has an answer.
 */
export interface ReopenProjectMutation {
  kind: 'project:reopen';
  at: string;
  projectId: string;
  /** Why it is being reopened. Required. */
  note: string;
}

/**
 * Erase a development entirely.
 *
 * Refused unless nothing has ever been filed against it and it carries no
 * position, which is checked at the boundary in server/routes.ts and in the
 * browser repository. A development that has reported anything can only be
 * archived: deleting it would leave the change log referring to something
 * that no longer exists, which is a broken audit trail rather than a tidy one.
 */
export interface DeleteProjectMutation {
  kind: 'project:delete';
  at: string;
  projectId: string;
  /**
   * Why it was removed for good. Required by the route — this is the one act
   * in the system that takes a development out of the replay, so the entry
   * explaining it is the only thing a reader will have left.
   *
   * Optional on the type for the same reason `retainDays` is: entries filed
   * before it existed must still replay.
   */
  note?: string;
}

export type Mutation =
  | CreateIpcMutation
  | RecordClaimMutation
  | ConfirmPaymentMutation
  | AwardContractMutation
  | ApproveVariationMutation
  | CreateProjectMutation
  | UpdateProjectMutation
  | ArchiveProjectMutation
  | RestoreProjectMutation
  | CloseProjectMutation
  | ReopenProjectMutation
  | DeleteProjectMutation
  | SubmitPeriodMutation;

/**
 * The mutations that move a figure, as opposed to describing or filing a
 * development.
 *
 * A closed development accepts none of these — that is what "closed" means —
 * and both the server and the browser read this one list rather than each
 * keeping their own, so they cannot come to disagree about what freezing a
 * development freezes.
 */
/**
 * THE ACTS THAT DECIDE WHAT A DEVELOPMENT IS, RATHER THAN WHAT IT REPORTS.
 *
 * Registering one, amending its description or budget, awarding a package,
 * deleting it, restoring it, closing it out, reopening it. On the owner's
 * instruction these are PROPOSED by the PMO Controls Manager and AUTHORISED
 * by the Director before they take effect — the same two-pair-of-eyes rule
 * monthly reporting has had since Phase 5, applied to the acts that were
 * still single-handed.
 *
 * The rule the server applies is one sentence: a seat that can AUTHORISE (the
 * Director) or ADMINISTER (the owner's administrator, on the standing
 * exemption) performs these directly; a seat that can only APPROVE proposes
 * them, and the change waits in `project_change_requests` until somebody else
 * lets it through. Monthly data entry is deliberately absent — it has its own
 * three-stage workflow and a second queue in front of it would mean a period
 * waiting on four people.
 *
 * Shared with the browser so the screens can say "this will be sent for
 * authorisation" BEFORE the button is pressed, rather than after.
 */
export const AUTHORISED_KINDS: readonly Mutation['kind'][] = [
  'project:create', 'project:update', 'project:archive', 'project:restore',
  'project:close', 'project:reopen', 'project:delete', 'contract:award',
];

/**
 * One line a Director can decide from without opening the payload.
 *
 * Written from the mutation itself so the queue cannot describe something
 * other than what it will apply — the summary and the payload are the same
 * fact stated twice, and only one of them is authoritative.
 */
export function summarise(m: Mutation): string {
  switch (m.kind) {
    case 'project:create':
      return `Register ${m.project.id} — ${m.project.name}`;
    case 'project:update': {
      const parts: string[] = [];
      if (m.name !== undefined) parts.push(`name to "${m.name}"`);
      if (m.portfolio !== undefined) parts.push(`portfolio to ${m.portfolio}`);
      if (m.route !== undefined) parts.push(`delivery route to ${m.route}`);
      if (m.pmc !== undefined) parts.push(`delivery partner to ${m.pmc}`);
      if (m.budget !== undefined) parts.push(`approved budget to ${m.budget.toLocaleString('en-GB')} SAR`);
      if (m.start !== undefined) parts.push(`start to ${m.start}`);
      if (m.finish !== undefined) parts.push(`finish to ${m.finish}`);
      return `Amend ${m.projectId}: ${parts.length ? parts.join(', ') : 'no field'}`;
    }
    case 'project:archive':
      return `Delete ${m.projectId}, kept ${m.retainDays ?? 0} days in the archive`;
    case 'project:restore':
      return `Restore ${m.projectId} to the portfolio`;
    case 'project:close':
      return `Close out ${m.projectId}`;
    case 'project:reopen':
      return `Reopen ${m.projectId}`;
    case 'project:delete':
      return `Remove ${m.projectId} permanently`;
    case 'contract:award':
      return `${m.contract.awarded ? 'Award' : 'Record'} ${m.contract.id} on ${m.projectId}`
        + ` to ${m.contract.contractor} at ${m.contract.value.toLocaleString('en-GB')} SAR`;
    default:
      return m.kind;
  }
}

export const REPORTING_KINDS: readonly Mutation['kind'][] = [
  'ipc', 'claim:record', 'claim:pay', 'contract:award', 'variation:approve', 'period:submit',
  'project:update',
];

/**
 * Whether a development has never been used, and so may be deleted outright
 * rather than archived.
 *
 * Two conditions, both necessary. Nothing in the change log may refer to it,
 * and it must carry no position: a seeded development arrives with cost
 * already incurred and has plainly reported something, whatever the log says.
 */
export function isUntouched(p: Project, log: readonly Mutation[]): boolean {
  const referenced = log.some((m) =>
    (m.kind === 'ipc' || m.kind === 'period:submit' || m.kind === 'variation:approve')
    && m.projectId === p.id);
  const spent = p.actual > 0 || p.committed > 0 || p.ipcSubmitted > 0 || p.paid > 0 || p.ev > 0;
  return !referenced && !spent;
}

/** A new development starts with its budget authorised and nothing spent. */
export function projectFromInput(
  input: CreateProjectMutation['project'],
  packages: readonly PackageInput[] = [],
  contracts: readonly ContractInput[] = [],
): Project {
  const budget = Math.max(0, Math.round(input.budget));
  const planned = packages.reduce((a, k) => a + Math.max(0, Math.round(k.budget)), 0);
  const awarded = contracts
    .filter((c) => c.awarded !== null)
    .reduce((a, c) => a + Math.max(0, Math.round(c.value)), 0);
  const pmc = contracts.find((c) => c.role === 'PMC')?.contractor;
  return {
    id: input.id,
    name: input.name,
    portfolio: input.portfolio,
    route: input.route,
    pmc: pmc ?? defaultPartner(input.route),
    budget,
    // The control budget is what has been broken into packages. Where the
    // workbook gave NO packages at all, it falls back to the authorised budget
    // less an unallocated reserve — the same relationship the existing
    // developments carry.
    //
    // The test is `packages.length`, never `planned > 0`. Packages supplied
    // become the WBS register, so a set of them summing to zero took the
    // fallback and left the register at nought against a control budget of 95%
    // of the authorised amount — control 1 then refused the write with a 422
    // and the dialog sat there. That is what made Add Project look like a
    // button that did nothing: the template ships example package rows, and
    // importing it walked straight into this. Deriving both figures from the
    // same list is what makes them unable to disagree.
    control: packages.length ? Math.min(budget, planned) : Math.round(budget * 0.95),
    afc: budget,
    // Only AWARDED packages commit the owner. One out to tender carries an
    // estimate and a place in the forecast and promises nobody anything.
    committed: Math.min(budget, awarded),
    actual: 0,
    ev: 0,
    pv: 0,
    spi: 1,
    cpi: 1,
    progress: 0,
    status: 'On Track',
    start: 'To be confirmed',
    finish: 'To be confirmed',
    duration: 'To be confirmed',
    paid: 0,
    ipcSubmitted: 0,
    risks: 0,
    highRisks: 0,
    openNcr: 0,
    openIssues: 0,
    emv: 0,
  };
}

/**
 * Apply a correction to a development's details.
 *
 * Only the fields the amendment carries move, and none of them is a reported
 * figure. The budget is the one that has arithmetic behind it, and it is
 * handled with care:
 *
 *   * The CONTROL budget is the part of the authorised budget broken into
 *     packages, so it can never exceed it. Lowering the authorised budget
 *     below the control budget would leave the development failing control 1
 *     the moment it was saved; it is clamped instead, which is the same
 *     relationship registering one from a workbook produces.
 *   * The AFC tracks the authorised budget ONLY while nothing has been
 *     forecast against it — that is, while the two are still equal. Once a
 *     period has moved the anticipated final cost, that figure is a forecast
 *     somebody made and this form has no business overwriting it.
 *
 * The reconciliation controls run over the result before it is written, on the
 * server, exactly as they do for every other change.
 */
export function applyProjectUpdate(p: Project, m: UpdateProjectMutation): Project {
  const next: Project = { ...p };
  if (m.name !== undefined && m.name.trim()) next.name = m.name.trim();
  if (m.portfolio !== undefined) next.portfolio = m.portfolio;
  if (m.route !== undefined) {
    next.route = m.route;
    // A development moved off a PMC and onto the owner's own team keeps the
    // consultant's name on every screen until somebody notices. If the name
    // still reads as the default for the route it came from, move it too.
    if (m.pmc === undefined && (next.pmc === 'To be appointed' || next.pmc === 'Internal')) {
      next.pmc = defaultPartner(m.route);
    }
  }
  if (m.pmc !== undefined && m.pmc.trim()) next.pmc = m.pmc.trim();
  if (m.start !== undefined && m.start.trim()) next.start = m.start.trim();
  if (m.finish !== undefined && m.finish.trim()) next.finish = m.finish.trim();
  if (m.start !== undefined || m.finish !== undefined) {
    // The duration restates the two dates, so it follows them — a stored
    // "12 months" beside a programme that now runs fourteen would be the
    // register disagreeing with itself in one row.
    const s = parseDate(next.start);
    const f = parseDate(next.finish);
    if (s !== null && f !== null && f > s) {
      const months = Math.max(1, Math.round((f - s) / (30.44 * 86_400_000)));
      next.duration = `${months} months`;
    }
  }
  if (m.budget !== undefined && Number.isFinite(m.budget) && m.budget > 0) {
    const tracked = p.afc === p.budget;
    next.budget = Math.round(m.budget);
    next.control = Math.min(next.control, next.budget);
    if (tracked) next.afc = next.budget;
  }
  return next;
}

/**
 * Apply an interim payment certificate to a project.
 *
 * Certifying work raises what the owner has certified and what it has paid,
 * net of retention. Nothing else: see the note inside.
 */
export function applyIpc(p: Project, m: CreateIpcMutation): Project {
  // A certificate is a CASH event: it moves what has been certified and what
  // has been paid. It does not move earned value — the work was earned when
  // it was done and measured, in the reporting period — and it does not add
  // to actual cost, which the period already carries. Adding the gross
  // certified value to both AC and EV pulled CPI toward 1.0 and inflated SPI
  // on every certificate, and could push EV past the budget.
  const net = Math.max(0, m.certified - m.retention);
  return {
    ...p,
    ipcSubmitted: p.ipcSubmitted + m.certified,
    paid: p.paid + net,
  };
}

/**
 * A confirmed transfer moves the cash position and leaves everything else
 * exactly where it was. See `ConfirmPaymentMutation` for why it moves `paid`
 * and not `ipcSubmitted`.
 */
export function applyPayment(p: Project, m: ConfirmPaymentMutation): Project {
  return { ...p, paid: p.paid + sar(m.amount) };
}

/**
 * An AWARD moves committed cost by the value promised; a package recorded out
 * to tender moves nothing, exactly as at registration. Nothing else moves —
 * earned value, actual cost, certified and paid are the product of periods
 * and claims, and an award is a promise, not a payment.
 */
export function applyAward(p: Project, m: AwardContractMutation): Project {
  if (m.contract.awarded === null) return p;
  return { ...p, committed: p.committed + Math.max(0, sar(m.contract.value)) };
}

/**
 * A claim moves the same two figures a certificate does, for the same reason:
 * it is a cash event. Earned value and actual cost come from the reporting
 * period, and adding an approved claim to either would count the work twice.
 */
export function applyClaim(p: Project, m: RecordClaimMutation): Project {
  const net = Math.max(0, m.approved - retentionOf(m.approved, m.retentionRate));
  return {
    ...p,
    ipcSubmitted: p.ipcSubmitted + m.approved,
    paid: p.paid + net,
  };
}

// ==========================================================================
// REPORTING PERIOD ENTRY
//
// The shape of PT_TEMPLATE — the sheet project managers already fill each
// reporting period. Sections 1, 2, 4 and 5 of that workbook, in the order they
// appear on it.
//
// Section 3 of the template (the earned-value position) is deliberately NOT an
// input. The sheet computes it from the work packages — PV = budget x planned%,
// EV = budget x actual% — and so does this. That is the single most important
// property of entering data this way: earned value stops being a number
// somebody types and becomes a consequence of the packages, which is what
// makes the performance indices mean anything.
// ==========================================================================

export interface SubmitPeriodMutation {
  kind: 'period:submit';
  at: string;
  projectId: string;
  /** Reporting period number, from section 1 of the template. */
  period: number;
  /** Data date as entered, kept as a label — the app never parses it. */
  dataDate: string;
  /** Section 2. Approved Development Budget, Control Budget, adopted AFC. */
  budget: number;
  control: number;
  afc: number;
  packages: PackageInput[];
  categories: CategoryInput[];
}

/** Whole SAR. Every figure in this system is an exact riyal. */
const sar = (n: number): number => Math.round(n);

/**
 * A project's position after a period is entered.
 *
 * SPI and CPI are stored here only because the Project record carries those
 * fields; the application derives them with spiOf/cpiOf and never reads these.
 * They are written consistently so a reader of the raw row is not misled.
 */
export function applyPeriod(p: Project, m: SubmitPeriodMutation): Project {
  const { pv, ev, actual, committed } = positionFromPackages(m.packages);
  const budget = sar(m.budget) || p.budget;
  const progress = budget ? Math.min(100, Math.round((ev / budget) * 100)) : 0;
  const spi = pv ? Number((ev / pv).toFixed(2)) : 1;
  const cpi = actual ? Number((ev / actual).toFixed(2)) : 1;

  // The status FOLLOWS the period rather than standing where registration
  // left it. A created development stood at "On Track" for ever, however its
  // periods read — a job a month past its planned finish at 90% earned was
  // still counted "on track" by every roll-up. The rule is `reportedStatus`
  // (domain/calc.ts), and the past-finish test is cut against the period's
  // own data date, so a period reported FOR a month after the stated planned
  // finish is what says the calendar has been missed. "Not complete" is
  // EV < PV, never the progress percentage: progress is EV over the APPROVED
  // budget, which a finished job never reaches while contingency exists, so
  // testing it would call a complete development Delayed for ever.
  const finish = parseDate(p.finish);
  const dd = parseDate(m.dataDate);
  const pastFinish = finish !== null && dd !== null && dd > finish && ev < pv;

  return {
    ...p,
    budget,
    control: sar(m.control),
    afc: sar(m.afc),
    pv,
    ev,
    actual,
    committed,
    progress,
    spi,
    cpi,
    status: reportedStatus(spi, cpi, pastFinish),
  };
}
