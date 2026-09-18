// ==========================================================================
// THE DATA BOUNDARY — types
//
// Split out from repository.ts so the API server can import the contract
// without pulling in the browser repository (and its localStorage) behind it.
// repository.ts re-exports everything here, so no screen import changed.
// ==========================================================================
import type {
  ActivityEntry, ChangeRequest, CostCategory, EquipmentItem, Issue, ManpowerTrade,
  Ncr, NotificationItem, ProcurementPackage, Project, ReconciliationControl,
  ReportDefinition, Risk, Role, ScurvePoint, Variation, WbsNode,
  PaymentClaim, CorrectiveAction, Mitigation, AttendanceWeek, WorkforceByParty,
  Incident, Observation, HseInspection, TrainingCourse, Permit, QualityInspection,
  MaterialApproval, ResourcePlanRow, MaintenanceJob,
} from '@/domain/types';
import type { SeatCapabilities } from '@/domain/seats';
import type { PortfolioRef, PortfolioTone, RouteRef } from '@/domain/portfolios';
import type { Mutation, SubmitPeriodMutation } from './mutations.js';

// One shape for what a seat may do, defined in the model and re-exported here
// so the boundary's types read as one set. See `domain/seats.ts`.
export type { SeatCapabilities } from '@/domain/seats';
export type { PortfolioRef, RouteRef, PortfolioTone } from '@/domain/portfolios';

/** A reporting period awaiting review or approval. */
export interface Submission {
  id: number;
  projectId: string;
  period: number;
  dataDate: string;
  state: 'submitted' | 'reviewed' | 'approved' | 'returned';
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Who sent it back, and when. Null unless it was. */
  returnedBy: string | null;
  returnedAt: string | null;
  returnedNote: string | null;
  /**
   * The figures as entered. Null for a reader looking at a period that has
   * not been approved: a Director sees that something is filed and with whom
   * it sits, and the numbers only once they are fact.
   */
  payload: SubmitPeriodMutation | null;
}

// ---- proposals waiting on authorisation --------------------------------
//
// Registering, amending, deleting, restoring, closing, reopening and awarding
// a package took effect the moment the PMO Controls Manager pressed the
// button. On the owner's instruction they now take two people: the manager
// PROPOSES and the Director AUTHORISES, and nothing moves in between.
//
// A proposal is NOT a change. It moves no figure, appears in no roll-up and
// is not in the change log — the mutation is appended at the moment of
// authorisation, through the same write lock and the same twenty
// reconciliation controls as a direct act. This type is the queue, and the
// queue is not the record.

/** One act waiting for, or having received, a decision. */
export interface ProposedChange {
  id: number;
  kind: Mutation['kind'];
  projectId: string | null;
  /** The mutation exactly as it would be filed. Validated when proposed. */
  payload: Mutation;
  /** One line a Director can decide from without opening the payload. */
  summary: string;
  /** Why it is being asked for. Required at proposal. */
  reason: string;
  state: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/**
 * What `commit` did.
 *
 * Two outcomes, and a screen that treated the second as a failure would tell
 * a PMO manager their amendment had been refused when it is sitting in a
 * queue with their name on it. So the shape says which happened rather than
 * leaving the caller to infer it from a status code it never sees.
 */
export type CommitResult =
  | { queued: false; log: Mutation[] }
  | { queued: true; request: ProposedChange };

// ---- seats -------------------------------------------------------------
//
// What a role may do is a row in a table the administrator edits, not a
// constant compiled into the server. `db/migrations/015` moved it, and the
// separation-of-duties trigger reads the same flags — so this is a view of
// the enforcement, never a restatement of it.

/** One seat as the administration screen sees it. */
export interface Seat {
  role: string;
  title: string;
  describes: string;
  can: SeatCapabilities;
  /**
   * May occupy two stages of one approval trail. The administrator's standing
   * exemption and nobody else's — deliberately not settable from any screen.
   */
  sodExempt: boolean;
  /** A seat the product names in code. Editable, never removable. */
  builtIn: boolean;
  /** How many active accounts hold it. A seat in use is never removed. */
  holders: number;
}

/** Registers belonging to a single development. */
export interface ProjectRegisters {
  wbs: WbsNode[];
  costCategories: CostCategory[];
  variations: Variation[];
  changes: ChangeRequest[];
  procurement: ProcurementPackage[];
  claims: PaymentClaim[];
  manpower: ManpowerTrade[];
  equipment: EquipmentItem[];
  ncrs: Ncr[];
  risks: Risk[];
  issues: Issue[];
  /**
   * The operational registers behind the sub-tabs. Every one of these is
   * DERIVED from a register above it — corrective actions from the NCRs,
   * mitigations from the risks, attendance from the manpower hours, workforce
   * from the manpower and the packages — so none of them can disagree with the
   * register it answers, and none of them carries money.
   */
  correctiveActions: CorrectiveAction[];
  mitigations: Mitigation[];
  attendance: AttendanceWeek[];
  workforce: WorkforceByParty[];
  /**
   * The operational registers behind the HSE, Quality, Manpower and Equipment
   * sub-tabs. Incidents, observations, HSE inspections and material approvals
   * are authored fixtures scaled to the development's own exposure; the rest
   * are derived from a register above them — training and permits from the
   * trades on site, quality inspections from the non-conformances they raised,
   * the resource plan from the workforce and the progress, maintenance from
   * the equipment register.
   */
  incidents: Incident[];
  observations: Observation[];
  hseInspections: HseInspection[];
  training: TrainingCourse[];
  permits: Permit[];
  qualityInspections: QualityInspection[];
  materialApprovals: MaterialApproval[];
  resourcePlan: ResourcePlanRow[];
  maintenance: MaintenanceJob[];
}

/** Corporate-level data that does not vary by project. */
export interface CorporateData {
  /**
   * THE PORTFOLIOS AS ROWS, not names.
   *
   * `db/migrations/017` made them a table the administrator edits, and each
   * carries the one tone it is drawn in — so a screen that shows a portfolio
   * asks here rather than holding its own colour map. Two screens held two
   * different ones before this, and a portfolio added tomorrow was in neither.
   */
  portfolios: PortfolioRef[];
  /** How the owner delivers the work. Rows, for the same reason. */
  routes: RouteRef[];
  months: string[];
  scurve: ScurvePoint[];
  activities: ActivityEntry[];
  reconciliation: ReconciliationControl[];
  reports: ReportDefinition[];
  notifications: NotificationItem[];
  roles: Role[];
}

/** An account, as the administration screen sees it. No password, ever. */
export interface AccountSummary {
  id: string;
  email: string;
  name: string;
  /**
   * The seat this account holds. A NAME, not a union: seats are rows an
   * administrator adds and edits (migration 015), so a closed set of five
   * literals here would make defining a sixth a code change — which is the
   * thing this feature exists to remove.
   */
  role: string;
  /** A withdrawn account keeps its history and cannot sign in. */
  active: boolean;
  avatar: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  /** Developments this person may input for. Empty for every other role. */
  projects: string[];
  /** Whether they have filed, validated, approved or recorded anything. */
  hasActed: boolean;
}

/** The blank reporting workbook, for a person about to collect a period. */
/** What a filled new-development workbook says. Nothing here is committed. */
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
   * Rows the workbook carried but nobody filled in — a package with no budget,
   * a contract with no counterparty. The screen states the count rather than
   * dropping them quietly, because a person who typed six rows and registered
   * four deserves to be told which arithmetic they are looking at.
   */
  skipped: { packages: number; contracts: number };
}

export interface TemplateFile {
  filename: string;
  sha256: string;
  base64: string;
}

// ---- messages --------------------------------------------------------
//
// A message is NOT a mutation. It moves no figure, so it is not in the change
// log, not replayed, and not put through the reconciliation controls. That
// separation is the point: a conversation able to change the reported
// position would be a way around the entire review-and-approve workflow.

/** One person you can write to, and the state of that conversation. */
export interface Correspondent {
  id: string;
  name: string;
  role: string;
  /** A withdrawn account keeps its history but cannot be written to. */
  active: boolean;
  avatar: string | null;
  unread: number;
  lastAt: string | null;
  lastBody: string | null;
  lastFromMe: boolean | null;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  body: string;
  /** The development it is about, when it is about one. A reference, not a link. */
  projectId: string | null;
  at: string;
  read: boolean;
}

export interface Inbox {
  people: Correspondent[];
  unread: number;
}

// ---- the model -------------------------------------------------------
//
// Reached only through the API. There is no model SDK in this directory and
// there must never be one: the key is server-side, and a `VITE_`-prefixed one
// would be inlined into dist/index.html by the build.

export interface AiStatus {
  /** Whether this deployment has a model behind it at all. */
  configured: boolean;
  /** Which one, for the administration screen. Null when unconfigured. */
  model: string | null;
}

/** What a document was read to say. NOTHING here has been filed. */
export interface ExtractedDocument {
  documentType: string | null;
  projectId: string | null;
  reference: string | null;
  period: string | null;
  contractor: string | null;
  certified: number | null;
  retention: number | null;
  netPayable: number | null;
  notes: string | null;
  /** 0-100 per field. The reviewer's guide to what to check first. */
  confidence: {
    documentType: number; projectId: number; reference: number;
    period: number; contractor: number; certified: number; retention: number;
  };
}

export interface PmoRepository {
  /** The developments in the portfolio. Never the archived ones. */
  getProjects(): Promise<Project[]>;

  /**
   * The whole readable position in one call.
   *
   * Optional: the fixtures repository has no network and gains nothing from
   * it. Where an implementation offers it, `loadSnapshot` uses it instead of
   * fetching the projects, the corporate reference data and then one register
   * per development — which was eleven requests for eight developments, on
   * first load and again after every change.
   */
  getSnapshot?(): Promise<DataSnapshot>;
  /** The developments taken out of the portfolio, for the seats that may restore one. */
  getArchivedProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  getRegisters(projectId: string): Promise<ProjectRegisters>;
  getCorporate(): Promise<CorporateData>;

  /**
   * Record a change — or PROPOSE it, where the caller's seat may not act alone.
   *
   * `reason` is what the proposal is filed with, and it is required only on
   * that road: a seat that authorises is acting, and an act carries its own
   * note. The result says which of the two happened, because a screen that
   * read a queued proposal as a failure would tell a PMO manager their
   * amendment was refused while it sat in a queue with their name on it.
   */
  commit(mutation: Mutation, reason?: string): Promise<CommitResult>;
  getMutations(): Promise<Mutation[]>;
  /** Drop every recorded change and return to the shipped fixtures. */
  reset(): Promise<void>;

  /**
   * File a reporting period for review.
   *
   * Distinct from `commit` on purpose. A period is not a change to the
   * reported position — it is a submission, and it becomes part of that
   * position only when someone else reviews it and a third person approves.
   * On the self-contained demo there is nobody to review it, so the mock
   * records it directly and the demo behaves as it always has.
   */
  submitPeriod(m: SubmitPeriodMutation): Promise<void>;
  /** Periods awaiting review or approval. Empty on the self-contained build. */
  getSubmissions(): Promise<Submission[]>;
  /** Advance a submission. The server decides whether this caller may. */
  actOnSubmission(id: number, action: 'review' | 'approve' | 'return', note?: string): Promise<void>;
  /** The blank PT_TEMPLATE to fill in. Only where the importer exists. */
  getTemplate(): Promise<TemplateFile>;

  /** The blank new-development workbook, for the seats that may register one. */
  getProjectTemplate(): Promise<TemplateFile>;

  /**
   * Read a filled new-development workbook.
   *
   * Nothing is registered: what comes back fills the Add Project form, where
   * the person sees what was read and what it implies before committing it.
   */
  parseProjectTemplate(file: ArrayBuffer): Promise<ProjectImport>;

  // ---- messages -------------------------------------------------------
  //
  // Present on the interface, refused by the fixtures. The self-contained
  // build has no accounts, so there is literally nobody to write to, and the
  // screen says exactly that rather than showing an invented conversation.

  // ---- the model ------------------------------------------------------

  /** Whether a model is connected. The fixtures build always says no. */
  getAiStatus(): Promise<AiStatus>;
  /** Ask the assistant. The answer is grounded on a brief the server computes. */
  askAssistant(question: string, scope: {
    level: string; portfolio?: string; project?: string;
  }): Promise<string>;
  /** Read a document. Fills a form; files nothing. */
  extractDocument(file: ArrayBuffer, mimeType: string): Promise<ExtractedDocument>;

  /** Everyone this person can write to, with unread counts. One round trip. */
  getInbox(): Promise<Inbox>;
  /**
   * One conversation, oldest first.
   *
   * `mark` true marks what the other person sent as read. False for a POLL:
   * a poll that wrote would issue an UPDATE every interval, for as long as
   * the tab stays open, to record something already recorded.
   */
  getConversation(withId: string, mark?: boolean): Promise<Message[]>;
  sendMessage(to: string, body: string, projectId: string | null): Promise<Message>;

  // ---- proposals, and the seats that decide them ----------------------
  //
  // Present on the interface, refused by the fixtures. The self-contained
  // build has no accounts, so there is nobody to propose to and nobody to
  // authorise: every act there applies directly, exactly as it always has.

  /** Every proposal, pending first. Readable by everyone signed in. */
  getChanges(): Promise<ProposedChange[]>;
  /**
   * Decide one. `approve` APPLIES the payload — through the same write lock
   * and the same twenty controls as a direct act — and marks the row in the
   * same transaction; `reject` and `withdraw` write the decision and nothing
   * else. The note is required either way: it is the record of the decision.
   */
  decideChange(
    id: number, action: 'approve' | 'reject' | 'withdraw', note: string,
  ): Promise<ProposedChange>;

  /** Every seat and what it may do, with how many accounts hold each. */
  listSeats(): Promise<Seat[]>;

  // ---- the vocabulary: portfolios and delivery routes -----------------
  //
  // Rows since migration 017. `listReference` carries the DEVELOPMENT COUNT
  // beside each, which the corporate snapshot does not: the snapshot is what
  // every screen draws with, and counting the replay for it on every load
  // would be work nobody reads. The Administration panel is the one place
  // that number matters, because it is what a Remove button will refuse on.
  listReference(): Promise<{ portfolios: PortfolioRef[]; routes: RouteRef[] }>;
  addPortfolio(name: string, tone: PortfolioTone): Promise<PortfolioRef>;
  addRoute(name: string, describes: string): Promise<RouteRef>;
  updatePortfolio(name: string, patch: { tone?: PortfolioTone; sort?: number }): Promise<PortfolioRef>;
  updateRoute(name: string, patch: { describes?: string; sort?: number }): Promise<RouteRef>;
  removePortfolio(name: string): Promise<void>;
  removeRoute(name: string): Promise<void>;
  createSeat(input: {
    role: string; title: string; describes: string; can: SeatCapabilities;
  }): Promise<Seat>;
  updateSeat(role: string, patch: {
    title?: string; describes?: string; can?: SeatCapabilities;
  }): Promise<Seat>;
  deleteSeat(role: string): Promise<void>;

  // ---- accounts, and a person's own profile ---------------------------
  //
  // Present on the interface, refused by the mock. The self-contained build
  // has no sign-in and so no accounts; saying that plainly is better than a
  // screen offering a password change with nowhere to put it.
  listAccounts(): Promise<AccountSummary[]>;
  createAccount(input: {
    email: string; name: string; role: AccountSummary['role']; password: string;
  }): Promise<AccountSummary>;
  setAccountRole(id: string, role: AccountSummary['role']): Promise<AccountSummary>;
  setAccountActive(id: string, active: boolean): Promise<AccountSummary>;
  setAccountPassword(id: string, password: string): Promise<void>;
  setAccountAssignments(id: string, projects: string[]): Promise<AccountSummary>;
  deleteAccount(id: string): Promise<void>;
  updateProfile(patch: { name?: string; avatar?: string | null }): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;

  /**
   * Read a filled PT_TEMPLATE. Returns what the sheet says; files nothing.
   *
   * Parsed on the server so no spreadsheet reader is carried into the
   * portable dist/index.html, which has no use for one.
   */
  parseTemplate(projectId: string, file: ArrayBuffer): Promise<SubmitPeriodMutation>;
}

/**
 * Everything the app needs, loaded once.
 *
 * The screens render synchronously from this snapshot rather than each
 * managing its own loading state.
 */
export interface DataSnapshot {
  projects: Project[];
  registers: Record<string, ProjectRegisters>;
  corporate: CorporateData;
}

/** An empty register set, for a project that does not exist. */
export const EMPTY_REGISTERS: ProjectRegisters = {
  wbs: [], costCategories: [], variations: [], changes: [], procurement: [], claims: [],
  manpower: [], equipment: [], ncrs: [], risks: [], issues: [],
  correctiveActions: [], mitigations: [], attendance: [], workforce: [],
  incidents: [], observations: [], hseInspections: [], training: [], permits: [],
  qualityInspections: [], materialApprovals: [], resourcePlan: [], maintenance: [],
};
