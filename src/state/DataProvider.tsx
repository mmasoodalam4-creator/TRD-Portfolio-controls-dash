import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { Project } from '@/domain/types';
import { active } from '@/domain/calc';
import {
  AUTHORISED_KINDS, isUntouched, REPORTING_KINDS, type Mutation, type SubmitPeriodMutation,
} from '@/data/mutations';
import {
  loadSnapshot, repository, type CorporateData, type DataSnapshot, type ProjectRegisters,
} from '@/data/repository';
import type {
  AccountSummary, AiStatus, CommitResult, ExtractedDocument, PortfolioRef, PortfolioTone,
  ProjectImport, ProposedChange, RouteRef, Seat, SeatCapabilities, Submission,
} from '@/data/contracts';
import { useAuth } from '@/state/AuthProvider';
import { toast } from '@/components';

// Re-exported so screens can name a submission without reaching across the
// data boundary. The type is part of what the state layer serves.
export type {
  AccountSummary, CommitResult, PortfolioRef, PortfolioTone, ProjectImport, ProposedChange,
  RouteRef, Seat, SeatCapabilities, Submission,
} from '@/data/contracts';
// A screen that offers an act names the act. The mutation TYPE is part of what
// the state layer serves for that reason; the fixtures behind it are not, and
// eslint keeps every screen off them.
export type { Mutation } from '@/data/mutations';

// Which build this is, served through the boundary for the same reason. The
// AI screens need it to know whether their scripted behaviour is a
// demonstration or a lie — see the note in @/data/repository.
export { aiIsSimulated } from '@/data/repository';
export type { AiStatus, ExtractedDocument } from '@/data/repository';

interface DataContextValue {
  snapshot: DataSnapshot;
  /**
   * Record a change and reload. Actions go through here, never around it.
   *
   * The result says whether the change was APPLIED or only PROPOSED. Some
   * acts — registering, amending, deleting, restoring, closing, reopening and
   * awarding — take two people on the platform: the PMO Controls Manager
   * proposes and the Director authorises. A screen that ignored the
   * difference would tell the manager their amendment had gone through when
   * it is sitting in somebody else's queue.
   *
   * `reason` is what a proposal is filed with. The server requires it on that
   * road and strips it from the stored mutation either way.
   */
  commit: (mutation: Mutation, reason?: string) => Promise<CommitResult>;
  /** File a reporting period for review. See PmoRepository.submitPeriod. */
  submitPeriod: (mutation: SubmitPeriodMutation) => Promise<void>;
  /** Periods awaiting review or approval. */
  submissions: Submission[];
  /** Advance one. The server decides whether this caller may. */
  actOnSubmission: (id: number, action: 'review' | 'approve' | 'return', note?: string) => Promise<void>;
  /** Read a filled PT_TEMPLATE. Returns what it says; files nothing. */
  parseTemplate: (projectId: string, file: ArrayBuffer) => Promise<SubmitPeriodMutation>;
  /** Drop every recorded change and return to the shipped fixtures. */
  reset: () => Promise<void>;
  /** How many changes have been recorded this session. */
  changeCount: number;
  /** Every recorded change, oldest first — the audit trail. */
  log: Mutation[];
  /** Re-read the position and the log. Used after a proposal is authorised. */
  reload: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

/**
 * Loads the dataset through the repository once, then serves it synchronously.
 *
 * Screens stay synchronous deliberately: giving each one its own loading state
 * would change how the app behaves for no benefit while the data is local. The
 * async boundary that matters is the repository, and it is already in place.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [log, setLog] = useState<Mutation[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const changeCount = log.length;

  /** Reload the position and the log together, so they never disagree. */
  const reload = useCallback(async () => {
    const [s, l] = await Promise.all([loadSnapshot(), repository.getMutations()]);
    setSnapshot(s);
    setLog(l);
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([loadSnapshot(), repository.getMutations()])
      .then(([s, l]) => {
        if (!live) return;
        setSnapshot(s);
        setLog(l);
      });
    return () => { live = false; };
  }, []);

  const commit = useCallback(async (mutation: Mutation, reason?: string): Promise<CommitResult> => {
    // A CLOSED DEVELOPMENT ACCEPTS NO FIGURES, in this build as well as on the
    // platform. The server is the enforcement and refuses the same write with
    // the same reason; this is here so the offline demo behaves like the real
    // product rather than quietly accepting a certificate against a settled
    // final account, and so the person is told before a round trip.
    if (REPORTING_KINDS.includes(mutation.kind)) {
      const id = 'projectId' in mutation ? mutation.projectId : mutation.project.id;
      const target = snapshot?.projects.find((p) => p.id === id);
      if (target?.closedAt) {
        throw new Error(`${id} was closed out on ${target.closedAt.slice(0, 10)} and no longer `
          + 'accepts figures. Reopen it first if this is genuinely still to be recorded.');
      }
    }

    // The write. A failure HERE is a failure, and the caller should say so.
    const result = await repository.commit(mutation, reason);

    // A PROPOSAL MOVED NOTHING, so there is nothing to reload. Refreshing
    // anyway would be a request that can only return what is already on
    // screen, and a failed one would toast "the screen is behind" about a
    // position that has not changed.
    if (result.queued) return result;

    // The refresh is not the write. If it fails — a dropped connection, a
    // slow host — the change is already recorded, and rejecting here would
    // tell the person their change was not made when it was. That is the
    // worse of the two errors by a wide margin: they would do it again.
    try {
      await reload();
    } catch {
      toast(
        'Saved, but the screen is behind',
        'The change was recorded. Reload the page to see it.',
        'info',
      );
    }
    return result;
  }, [reload, snapshot]);

  const refreshSubmissions = useCallback(async () => {
    setSubmissions(await repository.getSubmissions());
  }, []);

  useEffect(() => { void refreshSubmissions(); }, [refreshSubmissions]);

  const submitPeriod = useCallback(async (mutation: SubmitPeriodMutation) => {
    // The same freeze `commit` applies. A period is IN `REPORTING_KINDS` but
    // travels this road instead of commit's, so the guard above never saw it —
    // and on the offline demo, where the mock repository records a period
    // directly, a closed development quietly accepted one. The server refuses
    // it too, now; this is the early message, not the enforcement.
    const target = snapshot?.projects.find((p) => p.id === mutation.projectId);
    if (target?.closedAt) {
      throw new Error(`${mutation.projectId} was closed out on ${target.closedAt.slice(0, 10)} `
        + 'and no longer accepts periods. Reopen it first if this is genuinely still to be reported.');
    }
    await repository.submitPeriod(mutation);
    // Reload rather than patch: on the platform the period is now a pending
    // submission and the position has NOT moved, while on the demo it has.
    // Asking the repository which is a good deal safer than assuming.
    await reload();
    await refreshSubmissions();
  }, [reload, refreshSubmissions, snapshot]);

  const actOnSubmission = useCallback(async (
    id: number, action: 'review' | 'approve' | 'return', note?: string,
  ) => {
    await repository.actOnSubmission(id, action, note);
    // An approval moves the reported position; a review or a return does not.
    // Reloading both covers all three without the screen needing to know.
    await reload();
    await refreshSubmissions();
  }, [reload, refreshSubmissions]);

  const parseTemplate = useCallback(
    (projectId: string, file: ArrayBuffer) => repository.parseTemplate(projectId, file),
    [],
  );

  const reset = useCallback(async () => {
    await repository.reset();
    await reload();
  }, [reload]);

  const value = useMemo<DataContextValue | null>(
    () => (snapshot
      ? {
        snapshot, commit, reset, changeCount, log, submitPeriod, submissions,
        actOnSubmission, parseTemplate, reload,
      }
      : null),
    [snapshot, commit, reset, changeCount, log, submitPeriod, submissions, actOnSubmission,
      parseTemplate, reload],
  );

  if (!value) return null;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData(): DataContextValue {
  const v = useContext(DataContext);
  if (!v) throw new Error('data hooks must be used inside <DataProvider>');
  return v;
}

const useSnapshot = (): DataSnapshot => useData().snapshot;

/** Record changes and reset the demo. */
export function useMutations() {
  const {
    commit, reset, changeCount, submitPeriod, submissions, actOnSubmission, parseTemplate,
  } = useData();
  return {
    commit, reset, changeCount, submitPeriod, submissions, actOnSubmission, parseTemplate,
  };
}

/**
 * Every development this person may see, closed ones included.
 *
 * Closed developments stay HERE on purpose. They are out of the control
 * arithmetic — `agg` drops them, which is where that belongs — but they are
 * still part of the portfolio's record, so the scope picker reaches them and
 * every register screen renders them exactly as before. Filtering them out
 * here would have made "still available for view" untrue in one line.
 *
 * Archived ones are not here: those are fetched on demand by the seat that
 * may see them.
 */
export function useProjects(): Project[] {
  return useSnapshot().projects;
}

/** The developments still being controlled — no closed ones, no archived ones. */
export function useActiveProjects(): Project[] {
  const projects = useProjects();
  return useMemo(() => active(projects), [projects]);
}

/** The developments that have been delivered and closed out, newest first. */
export function useClosedProjects(): Project[] {
  const projects = useProjects();
  return useMemo(
    () => projects.filter((p) => p.closedAt)
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    [projects],
  );
}

/** A recorded change as a line in an audit trail. */
export interface AuditEvent {
  at: string;
  what: string;
  icon?: string;
}

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * The audit trail for one development, or for everything.
 *
 * Built from the mutation log — the changes that were actually recorded —
 * newest first. Every register's History tab used to show the same five
 * fixture lines regardless of record; a system whose pitch is traceability
 * cannot fake its own trail.
 */
export function useAuditFor(projectId?: string): AuditEvent[] {
  const { log } = useData();
  return useMemo(() => log
    .filter((m) => !projectId || ('projectId' in m ? m.projectId === projectId : m.project.id === projectId))
    .map((m): AuditEvent => {
      switch (m.kind) {
        case 'ipc':
          return { at: when(m.at), what: `Certificate ${m.reference} recorded on ${m.projectId}`, icon: 'file' };
        case 'claim:record':
          return { at: when(m.at), what: `Claim ${m.reference} approved on ${m.projectId} — ${m.milestone} (${m.packageId})`, icon: 'file' };
        case 'claim:pay':
          return { at: when(m.at), what: `Payment ${m.reference} confirmed on ${m.projectId} against ${m.claimId}`, icon: 'check' };
        case 'contract:award':
          return {
            at: when(m.at),
            what: m.contract.awarded === null
              ? `Package ${m.contract.id} recorded out to tender on ${m.projectId} — ${m.contract.name}`
              : `Package ${m.contract.id} awarded to ${m.contract.contractor} on ${m.projectId}`,
            icon: 'cart',
          };
        case 'variation:approve':
          return { at: when(m.at), what: `Variation ${m.no} approved on ${m.projectId}`, icon: 'check' };
        case 'project:create':
          return { at: when(m.at), what: `Development ${m.project.id} added to the ${m.project.portfolio} portfolio`, icon: 'plus' };
        case 'project:update':
          return { at: when(m.at), what: `Development ${m.projectId} amended: ${m.note}`, icon: 'edit' };
        case 'project:archive':
          return {
            at: when(m.at),
            what: `Development ${m.projectId} deleted: ${m.note}`
              + (m.retainDays === undefined ? '' : ` (kept ${m.retainDays} days)`),
            icon: 'archive',
          };
        case 'project:restore':
          return {
            at: when(m.at),
            what: `Development ${m.projectId} restored to the portfolio${m.note ? `: ${m.note}` : ''}`,
            icon: 'change',
          };
        case 'project:close':
          return { at: when(m.at), what: `Development ${m.projectId} closed out: ${m.note}`, icon: 'check' };
        case 'project:reopen':
          return { at: when(m.at), what: `Development ${m.projectId} reopened: ${m.note}`, icon: 'change' };
        case 'project:delete':
          return {
            at: when(m.at),
            what: `Development ${m.projectId} removed permanently${m.note ? `: ${m.note}` : ''}`,
            icon: 'x',
          };
        case 'period:submit':
          return { at: when(m.at), what: `Reporting period ${m.period} (${m.dataDate}) approved into the position of ${m.projectId}`, icon: 'send' };
        default:
          return { at: '', what: 'Recorded change' };
      }
    })
    .reverse(), [log, projectId]);
}

/**
 * The developments taken out of the portfolio, fetched on demand.
 *
 * Not part of the snapshot: they are outside every roll-up by definition, and
 * only the two seats that may put one back can read them, so loading them for
 * everyone would be a request that fails for most people on every page.
 */
export function useArchivedProjects(enabled: boolean): Project[] {
  const { changeCount } = useData();
  const [list, setList] = useState<Project[]>([]);

  useEffect(() => {
    if (!enabled) { setList([]); return; }
    let alive = true;
    repository.getArchivedProjects()
      .then((rows) => { if (alive) setList(rows); })
      // A role that may not see them gets none, which is the same thing the
      // screen would show anyway. The refusal is the server's to make.
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [enabled, changeCount]);

  return list;
}

/**
 * Whether a development may be removed outright rather than archived.
 *
 * The same rule the server enforces, asked here so a screen can offer the
 * action only where it would succeed. The server is still what decides.
 */
export function useCanRemove(): (p: Project) => boolean {
  const { log } = useData();
  return useCallback((p: Project) => isUntouched(p, log), [log]);
}

/**
 * The two things a person may change about their own account.
 *
 * Through the repository like everything else, so the screen never learns
 * whether there is an API behind it. The mock refuses both, honestly: the
 * self-contained build has no account to hold a password.
 */
export function useProfile(): {
  updateProfile: (patch: { name?: string; avatar?: string | null }) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
} {
  return useMemo(() => ({
    updateProfile: (patch) => repository.updateProfile(patch),
    changePassword: (current, next) => repository.changePassword(current, next),
  }), []);
}

/** The change log exactly as recorded, oldest first. */
export function useLog(): Mutation[] {
  return useData().log;
}

/**
 * Whether an act of this kind will be PROPOSED rather than applied.
 *
 * One sentence, in one place, and it is the same sentence the server uses: a
 * seat that can authorise or administer acts directly, a seat that can only
 * approve proposes. Asked BEFORE the button is pressed so a dialog can say
 * "this goes to the Director" while the person still has the choice, rather
 * than surprising them with a queue afterwards.
 *
 * Never in the self-contained build: there are no accounts there, so there is
 * no Director to send anything to and every act applies at once.
 */
export function useProposes(): (kind: Mutation['kind']) => boolean {
  const { authRequired, can } = useAuth();
  return useCallback(
    (kind: Mutation['kind']) => authRequired
      && AUTHORISED_KINDS.includes(kind) && !can.authorise && !can.administer,
    [authRequired, can],
  );
}

/**
 * THE PROPOSAL QUEUE.
 *
 * Not part of the snapshot, for the reason messages are not: the snapshot is
 * the REPORTED POSITION, and a proposal has moved nothing. Carrying it
 * alongside would mean every proposal invalidated the position, and a
 * proposal is precisely the thing that did not.
 *
 * `reload` is exposed rather than polled. There is no long-lived process on a
 * serverless host, and a queue that a Director opens deliberately is not a
 * thing that needs to arrive unbidden — the screen refreshes when it is
 * opened, when something is proposed, and when something is decided.
 */
export function useChanges(enabled = true): {
  changes: ProposedChange[];
  /** How many are still waiting. What the queue's badge counts. */
  pending: number;
  loading: boolean;
  /** Why the queue could not be read. Null while it can. */
  error: string | null;
  reload: () => Promise<void>;
  /** Authorise, decline, or take back your own. Applies inside the server. */
  decide: (id: number, action: 'approve' | 'reject' | 'withdraw', note: string) => Promise<void>;
} {
  const { reload: reloadPosition } = useData();
  const [changes, setChanges] = useState<ProposedChange[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) { setChanges([]); setLoading(false); return; }
    try {
      setChanges(await repository.getChanges());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the queue could not be read');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);

  const decide = useCallback(async (
    id: number, action: 'approve' | 'reject' | 'withdraw', note: string,
  ) => {
    await repository.decideChange(id, action, note);
    // An authorisation APPLIES the mutation, so the position moved and every
    // screen behind this one is stale. A decline moved nothing, but reloading
    // both is one request either way and cannot be wrong.
    await Promise.all([reload(), reloadPosition()]);
  }, [reload, reloadPosition]);

  return {
    changes,
    pending: changes.filter((c) => c.state === 'pending').length,
    loading,
    error,
    reload,
    decide,
  };
}

/**
 * The seats, and what each may do.
 *
 * Read by everyone — a person who cannot press a button is owed an
 * explanation of who can — and written only by an administrator, which the
 * server enforces. `sodExempt` is deliberately not writable from anywhere:
 * see `updateSeat` in server/db.ts.
 */
export function useSeats(enabled = true): {
  seats: Seat[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: {
    role: string; title: string; describes: string; can: SeatCapabilities;
  }) => Promise<void>;
  update: (role: string, patch: {
    title?: string; describes?: string; can?: SeatCapabilities;
  }) => Promise<void>;
  remove: (role: string) => Promise<void>;
} {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) { setSeats([]); setLoading(false); return; }
    try {
      setSeats(await repository.listSeats());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the seats could not be read');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);

  return {
    seats,
    loading,
    error,
    reload,
    create: async (input) => { await repository.createSeat(input); await reload(); },
    update: async (role, patch) => { await repository.updateSeat(role, patch); await reload(); },
    remove: async (role) => { await repository.deleteSeat(role); await reload(); },
  };
}

/**
 * THE PORTFOLIOS AND THE DELIVERY ROUTES, with the count that decides whether
 * one can be removed.
 *
 * Read separately from the corporate snapshot even though the snapshot
 * carries the same two lists. The difference is the count: the snapshot is
 * what twenty screens draw with, and replaying every development to count
 * them per portfolio on every load would be work that one panel reads. So the
 * snapshot carries the definitions and this carries the definitions AND their
 * use, and only the Administration panel pays for the second.
 */
export function useReference(enabled = true): {
  portfolios: PortfolioRef[];
  routes: RouteRef[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addPortfolio: (name: string, tone: PortfolioTone) => Promise<void>;
  addRoute: (name: string, describes: string) => Promise<void>;
  setTone: (name: string, tone: PortfolioTone) => Promise<void>;
  removePortfolio: (name: string) => Promise<void>;
  removeRoute: (name: string) => Promise<void>;
} {
  const { reload: reloadPosition } = useData();
  const [portfolios, setPortfolios] = useState<PortfolioRef[]>([]);
  const [routes, setRoutes] = useState<RouteRef[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) { setPortfolios([]); setRoutes([]); setLoading(false); return; }
    try {
      const got = await repository.listReference();
      setPortfolios(got.portfolios);
      setRoutes(got.routes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'the lists could not be read');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);

  // Every write reloads the POSITION too: the corporate snapshot carries the
  // same lists, and a portfolio added here has to reach the scope selector
  // and the Add Project form without a page refresh.
  const after = useCallback(async () => {
    await Promise.all([reload(), reloadPosition()]);
  }, [reload, reloadPosition]);

  return {
    portfolios,
    routes,
    loading,
    error,
    reload,
    addPortfolio: async (name, tone) => { await repository.addPortfolio(name, tone); await after(); },
    addRoute: async (name, describes) => { await repository.addRoute(name, describes); await after(); },
    setTone: async (name, tone) => { await repository.updatePortfolio(name, { tone }); await after(); },
    removePortfolio: async (name) => { await repository.removePortfolio(name); await after(); },
    removeRoute: async (name) => { await repository.removeRoute(name); await after(); },
  };
}

/** Account administration, for the one role that has it. */
export function useAccounts(): {
  list: () => Promise<AccountSummary[]>;
  create: (input: { email: string; name: string; role: AccountSummary['role']; password: string }) => Promise<AccountSummary>;
  setRole: (id: string, role: AccountSummary['role']) => Promise<AccountSummary>;
  setActive: (id: string, active: boolean) => Promise<AccountSummary>;
  setPassword: (id: string, password: string) => Promise<void>;
  setAssignments: (id: string, projects: string[]) => Promise<AccountSummary>;
  remove: (id: string) => Promise<void>;
} {
  return useMemo(() => ({
    list: () => repository.listAccounts(),
    create: (input) => repository.createAccount(input),
    setRole: (id, role) => repository.setAccountRole(id, role),
    setActive: (id, active) => repository.setAccountActive(id, active),
    setPassword: (id, password) => repository.setAccountPassword(id, password),
    setAssignments: (id, projects) => repository.setAccountAssignments(id, projects),
    remove: (id) => repository.deleteAccount(id),
  }), []);
}

/** The blank reporting workbook, downloaded by the person collecting a period. */
export function useTemplate(): () => Promise<{ filename: string; base64: string }> {
  return useCallback(() => repository.getTemplate(), []);
}

/**
 * The blank new-development workbook, and the reader for a filled one.
 *
 * Reading it registers nothing. What comes back fills the Add Project form,
 * where the person sees what the sheet said and what it implies before
 * anybody commits it.
 */
export function useProjectTemplate(): {
  download: () => Promise<{ filename: string; base64: string }>;
  parse: (file: ArrayBuffer) => Promise<ProjectImport>;
} {
  return useMemo(() => ({
    download: () => repository.getProjectTemplate(),
    parse: (file: ArrayBuffer) => repository.parseProjectTemplate(file),
  }), []);
}

/**
 * The model, as the screens reach it.
 *
 * `status` is fetched once rather than assumed: a deployment either has a key
 * or it does not, and a screen that offers extraction where none is connected
 * teaches a person that the buttons are decorative. The fixtures repository
 * answers `configured: false` without a request, so the offline build stays
 * request-free.
 *
 * Neither call can write anything. The assistant returns prose grounded on a
 * brief the SERVER computed from the position; extraction returns fields for a
 * form. A model may fill a form; it may never file a figure.
 */
export function useAi(): {
  status: AiStatus | null;
  ask: (question: string, scope: { level: string; portfolio?: string; project?: string }) => Promise<string>;
  extract: (file: ArrayBuffer, mimeType: string) => Promise<ExtractedDocument>;
} {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let live = true;
    repository.getAiStatus()
      .then((s) => { if (live) setStatus(s); })
      .catch(() => { if (live) setStatus({ configured: false, model: null }); });
    return () => { live = false; };
  }, []);

  return useMemo(() => ({
    status,
    ask: (question, scope) => repository.askAssistant(question, scope),
    extract: (file, mimeType) => repository.extractDocument(file, mimeType),
  }), [status]);
}

export function useCorporate(): CorporateData {
  return useSnapshot().corporate;
}

const EMPTY: ProjectRegisters = {
  wbs: [], costCategories: [], variations: [], changes: [], procurement: [], claims: [],
  manpower: [], equipment: [], ncrs: [], risks: [], issues: [],
  correctiveActions: [], mitigations: [], attendance: [], workforce: [],
  incidents: [], observations: [], hseInspections: [], training: [], permits: [],
  qualityInspections: [], materialApprovals: [], resourcePlan: [], maintenance: [],
};

/** Registers for one development. Empty registers if the id is unknown. */
export function useRegisters(projectId: string): ProjectRegisters {
  const { registers } = useSnapshot();
  return registers[projectId] ?? EMPTY;
}

/**
 * A lookup across developments, for the integrity engine — it reconciles every
 * project in scope, not just the selected one.
 */
export function useRegistersFor(): (projectId: string) => ProjectRegisters {
  const { registers } = useSnapshot();
  // Stable while the snapshot is: `useScopedRegisters` memoises the whole
  // roll-up on this function's identity, and a fresh closure every render
  // would rebuild eight developments' registers on every keystroke.
  return useCallback((projectId: string) => registers[projectId] ?? EMPTY, [registers]);
}
