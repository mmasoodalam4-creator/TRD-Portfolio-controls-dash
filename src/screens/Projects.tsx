import type { Project } from '@/domain/types';
import type { PageId } from '@/app/types';
import type { Scope } from '@/domain/types';
import { useState } from 'react';
import { agg, progressOf } from '@/domain/calc';
import { fmt, pct, varianceTone } from '@/domain/format';
import { pillStyle, type PortfolioRef } from '@/domain/portfolios';
import {
  DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, daysLeft, restorable,
  retentionProblem,
} from '@/domain/retention';
import {
  useActiveProjects, useArchivedProjects, useCanRemove, useClosedProjects, useCorporate, useLog,
  useMutations, useProjects, useProposes, type Mutation,
} from '@/state/DataProvider';
import { KPI, Badge, Prog, Ic, toast, toastError } from '@/components';
import { EditProject } from '@/features/edit-project/EditProject';

// The colour a portfolio is drawn in belongs to the portfolio, not to this
// screen — see `domain/portfolios.ts`. This file used to hold one map and the
// Dashboard another, so Residential was blue here and navy there.

const COLUMNS = [
  'Project ID', 'Project Name', 'Portfolio', 'Delivery Route', 'PMC / Internal',
  'Approved Budget (SAR)', 'AFC (SAR)', 'Budget Variance', 'Status', 'Progress', 'Actions',
];

// THE THREE TABS THAT ARE NOT A PORTFOLIO.
//
// Named, because the rest of the tab row is the portfolios this person's
// developments are actually in — a list that changes when an administrator
// adds one. A union of literals and `Portfolio` would be no union at all now
// that a portfolio is a string.
const ALL = 'All';
const COMPLETED = 'Completed';
const ARCHIVE = 'Archive';

/** The acts that take a development out of, or back into, delivery. */
type ActKind = 'delete' | 'restore' | 'close' | 'reopen' | 'purge';

/**
 * What each act is, said to the person about to do it.
 *
 * Deleting, restoring, closing out, reopening and removing for good share one
 * dialog because they are the same shape — a development, a required reason,
 * one button — and five copies of it would have drifted. They are emphatically
 * NOT the same act, and the wording is where that difference is explained:
 * deleting says this should never have counted, closing says it counted and is
 * finished, and removing says the record itself goes.
 */
const ACT: Record<ActKind, {
  title: string; ask: string; placeholder: string; cta: string; busy: string;
  icon: string; done: string; doneSub: string; explain: (p: Project) => string;
}> = {
  delete: {
    title: 'Delete',
    ask: 'Why is it being deleted?',
    placeholder: 'e.g. Cancelled by the board on 3 September 2026',
    cta: 'Delete development',
    busy: 'Deleting…',
    icon: 'archive',
    done: 'Development deleted',
    doneSub: 'is out of the portfolio and in the archive',
    explain: (p) => `${p.name} leaves the portfolio immediately. It disappears from every `
      + 'dashboard, every report, every roll-up and every control, and its position, registers '
      + 'and audit trail are kept exactly as they are — in the Archive, where it can be restored '
      + 'in one click for as long as the retention period below. Delete a development that was '
      + 'CANCELLED; one that was delivered should be closed out instead, so that it stays on '
      + 'the record.',
  },
  restore: {
    title: 'Restore',
    ask: 'Why is it coming back?',
    placeholder: 'e.g. Board reversed the cancellation on 12 September 2026',
    cta: 'Restore development',
    busy: 'Restoring…',
    icon: 'change',
    done: 'Development restored',
    doneSub: 'is back in the portfolio',
    explain: (p) => `${p.name} returns to the portfolio with everything it had: the same `
      + 'position, the same registers, the same audit trail. It counts in the KPIs, the '
      + 'roll-ups and the reconciliation controls again from the moment it is back. Both the '
      + 'deletion and this restoration stay in the change log, so the record shows what '
      + 'happened rather than only where it ended.',
  },
  close: {
    title: 'Close out',
    ask: 'What is the closeout record?',
    placeholder: 'e.g. Final account agreed 30 August 2026, ref FA-RES-01',
    cta: 'Close development out',
    busy: 'Closing…',
    icon: 'check',
    done: 'Development closed out',
    doneSub: 'is complete; its figures are now final',
    explain: (p) => `${p.name} is delivered and its figures become FINAL. It stays on every `
      + 'screen, keeps its registers, its documents and its whole audit trail, and can be read '
      + 'exactly as it is now — but it no longer accepts a period, a certificate, a claim, a '
      + 'variation or an amendment, and it leaves the portfolio KPIs and the forecast, which '
      + 'are about the work still in delivery. It can be reopened.',
  },
  reopen: {
    title: 'Reopen',
    ask: 'Why is it being reopened?',
    placeholder: 'e.g. Retention release outstanding; final account reopened',
    cta: 'Reopen development',
    busy: 'Reopening…',
    icon: 'change',
    done: 'Development reopened',
    doneSub: 'is back in delivery and reporting again',
    explain: (p) => `${p.name} goes back into the portfolio. It counts in the KPIs and the `
      + 'forecast again and starts accepting periods, certificates and claims. Both the closure '
      + 'and this reopening stay in the change log, so the record shows what happened rather '
      + 'than only where it ended.',
  },
  // The one act in the system that cannot be undone, so it is the one whose
  // dialog says so first and in the plainest words available.
  purge: {
    title: 'Remove permanently',
    ask: 'Why is it being removed for good?',
    placeholder: 'e.g. Retention expired; records transferred to the archive on 4 October 2026',
    cta: 'Remove permanently',
    busy: 'Removing…',
    icon: 'x',
    done: 'Development removed',
    doneSub: 'has been erased and cannot be brought back',
    explain: (p) => `${p.name} is ERASED. Its position, its registers and everything filed `
      + 'against it go, and nothing restores them — this is the only act in the system with no '
      + 'way back. The change log keeps this entry, naming the development and this reason, so '
      + 'a reader a year from now can see that it existed and why it was removed.',
  },
};

/** The mutation each act files, once a reason has been given. */
const mutationFor = (
  kind: ActKind, projectId: string, note: string, retainDays: number,
): Mutation => {
  const at = new Date().toISOString();
  switch (kind) {
    case 'delete': return { kind: 'project:archive', at, projectId, note, retainDays };
    case 'restore': return { kind: 'project:restore', at, projectId, note };
    case 'close': return { kind: 'project:close', at, projectId, note };
    case 'reopen': return { kind: 'project:reopen', at, projectId, note };
    case 'purge': return { kind: 'project:delete', at, projectId, note };
  }
};

/** The colour a signed variance is printed in. Zero is neutral. */
const varianceColour = (v: number): string => {
  const t = varianceTone(v);
  return t === 'grey' ? 'var(--muted)' : `var(--${t})`;
};

/**
 * THE ARCHIVE — deleted developments, and how long is left to change your mind.
 *
 * Its own table rather than the portfolio one with a column bolted on. What a
 * reader wants here is not a budget variance: it is when it went, why, and
 * how many days remain — and a table that answered the first question in
 * eleven columns and the second in none would be the portfolio table wearing
 * a different tab.
 *
 * The countdown is READ, never scheduled. Nothing on a serverless host runs a
 * timer, and a cron that silently erased the owner's data would be the one act
 * in this system with no entry in the change log. Past the date the row says
 * so and offers removal instead of restoration.
 */
function ArchiveTable({ rows, now, log, portfolios, canPurge, busy, onAct }: {
  rows: Project[];
  now: number;
  log: Mutation[];
  portfolios: PortfolioRef[];
  canPurge: (p: Project) => boolean;
  busy: boolean;
  onAct: (p: Project, kind: ActKind) => void;
}) {
  const COLS = ['Project ID', 'Project Name', 'Portfolio', 'Deleted', 'Reason',
    'Retention', 'Actions'];

  /**
   * Why it was deleted, from the act that deleted it.
   *
   * Read from the change log rather than stored on the development: the
   * reason belongs to the ACT, and a copy of it on the record would be a
   * second place that could disagree with the audit trail about what was
   * said. The last deletion is the one that counts — a development can be
   * deleted, restored and deleted again.
   */
  const reasonFor = (id: string): string => {
    let found = '';
    for (const m of log) {
      if (m.kind === 'project:archive' && m.projectId === id) found = m.note;
    }
    return found;
  };

  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr>{COLS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
        <tbody>
          {rows.map((p) => {
            const left = daysLeft(p.retainUntil, now);
            const canRestore = restorable(p, now);
            return (
              <tr key={p.id}>
                <td><span className="tid">{p.id}</span></td>
                <td>{p.name}</td>
                <td><span className="pill" style={pillStyle(portfolios, p.portfolio)}>{p.portfolio}</span></td>
                <td>{p.archivedAt ? p.archivedAt.slice(0, 10) : '—'}</td>
                {/* A DIV for the same reason as the seats table: a
                    max-width on a `<td>` in an auto-layout table does
                    nothing, and a long deletion note would be painted over
                    the countdown beside it. */}
                <td>
                  <div style={{ maxWidth: 340, whiteSpace: 'normal' }}>
                    {reasonFor(p.id) || <span className="muted">not recorded</span>}
                  </div>
                </td>
                <td>
                  {/* Absent is not zero. A development deleted before
                      retention existed carries no window, so nothing about it
                      has expired and it stays restorable — saying "0 days
                      left" would be the system inventing a deadline it never
                      set. */}
                  {!p.retainUntil
                    ? <span className="pill b-grey">No expiry set</span>
                    : canRestore
                      ? (
                        <span className={`pill b-${left <= 7 ? 'amber' : 'blue'}`}
                          title={`Restorable until ${p.retainUntil.slice(0, 10)}`}>
                          {`${left} day${left === 1 ? '' : 's'} left`}
                        </span>
                      )
                      : (
                        <span className="pill b-red" title={`Window closed ${p.retainUntil.slice(0, 10)}`}>
                          {`Expired ${p.retainUntil.slice(0, 10)}`}
                        </span>
                      )}
                </td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '6px 11px' }}
                      disabled={busy || !canRestore}
                      title={canRestore ? `Restore ${p.id}` : 'The retention period has passed'}
                      onClick={() => onAct(p, 'restore')}>Restore</button>
                    {canPurge(p) && (
                      <button type="button" className="btn btn-ghost"
                        style={{ padding: '6px 11px', color: 'var(--red)' }}
                        disabled={busy}
                        onClick={() => onAct(p, 'purge')}>Remove</button>
                    )}
                  </div>
                  {/* THE DISABLED CONTROL SAYS WHY. A Restore that is simply
                      dead reads as a broken button — which is precisely how
                      the owner reported the archive control before every
                      refusal in this application learned to explain itself. */}
                  {!canRestore && (
                    <div className="form-hint" style={{ marginTop: 4 }}>
                      {'The retention period has passed, so this can no longer be restored. '
                        + 'An administrator may remove it permanently.'}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={COLS.length} className="muted" style={{ textAlign: 'center', padding: 18 }}>
              No developments have been deleted.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * All eight developments. Budget Variance here is Approved Budget less AFC —
 * a favourable cost variance, not a margin.
 *
 * Clicking a row sets scope to that project and opens its Overview, which is
 * how the demo drills from corporate to a single development in two clicks.
 */
export function Projects({ openScoped, canRetire = false }: {
  openScoped: (page: PageId, scope: Scope) => void;
  /** Whether this person may take a development out of the portfolio. */
  canRetire?: boolean;
}) {
  const projects = useProjects();
  const live = useActiveProjects();
  const closed = useClosedProjects();
  const { commit } = useMutations();
  const canRemove = useCanRemove();
  const { portfolios } = useCorporate();
  const log = useLog();
  const proposes = useProposes();
  // A STRING, not a union with `Portfolio` in it. Portfolios are rows an
  // administrator edits, so `Portfolio` is a string and a union that included
  // it collapsed to one — three literals that looked like a closed set and
  // were not. The three fixed tabs are named below instead.
  const [tab, setTab] = useState<string>(ALL);
  // The development an act is being confirmed for, and which act. Deleting,
  // restoring, closing out, reopening and removing for good all take the same
  // shape — a development, a required reason, one button — so they share one
  // dialog rather than five that would drift apart.
  const [acting, setActing] = useState<{ p: Project; kind: ActKind } | null>(null);
  // The development whose details are being corrected. Same seat as deleting:
  // amending the register is a portfolio act, not project-level reporting.
  const [editing, setEditing] = useState<Project | null>(null);
  const [note, setNote] = useState('');
  // HOW LONG A DELETED DEVELOPMENT IS KEPT. The owner asked to be asked, and
  // never to be allowed to answer less than thirty days; the field opens on
  // the minimum because that is the owner's own default.
  const [days, setDays] = useState(DEFAULT_RETENTION_DAYS);
  const [busy, setBusy] = useState(false);

  const archived = useArchivedProjects(canRetire);
  // Read ONCE per render rather than inside each row: a countdown that
  // re-read the clock per cell could print two different day counts in one
  // table, on the one day of the window where it matters most.
  const now = Date.now();
  // The portfolios that hold a development this person can see, not the
  // reference list of all four. Read from the LIVE list: a portfolio whose
  // every development has been delivered is not a portfolio being steered,
  // and its tab would always be empty.
  const inUse = [...new Set(live.map((p) => p.portfolio))];

  const list = tab === ARCHIVE ? archived
    : tab === COMPLETED ? closed
      : live.filter((p) => tab === ALL || p.portfolio === tab);
  const a = agg(projects);
  // What has been DELIVERED, totalled deliberately and labelled as such —
  // `as-given` because these are exactly the developments `agg` drops from
  // the portfolio it is steering.
  const done = agg(closed, 'as-given');

  // Completed is open to everybody: a delivered development is the record of
  // what the owner built, and reading the record is not a privileged act.
  // Archived stays with the seats that may put one back, because a cancelled
  // development is a decision rather than a record.
  const tabs: string[] = [
    ALL,
    ...inUse,
    ...(closed.length ? [COMPLETED] : []),
    ...(canRetire ? [ARCHIVE] : []),
  ];

  /**
   * File the act, and say which of the two things happened.
   *
   * A PROPOSAL IS NOT A FAILURE. On the platform a seat that may approve but
   * not authorise proposes rather than acts, and the answer comes back 202
   * with the queued row. Reporting that as "Delete refused" would tell a PMO
   * manager the opposite of what happened — their change is sitting in the
   * Director's queue with their name on it.
   */
  const act = (kind: ActKind, p: Project) => {
    const reason = note.trim();
    setBusy(true);
    commit(mutationFor(kind, p.id, reason, days), reason)
      .then((result) => {
        if (result.queued) {
          toast(
            `${ACT[kind].title} sent for authorisation`,
            `Proposal #${result.request.id} — ${result.request.summary}. `
              + 'Nothing has moved until the Director authorises it.',
            'info',
          );
        } else {
          toast(ACT[kind].done, `${p.id} ${ACT[kind].doneSub}`);
        }
        setActing(null);
        setNote('');
        setDays(DEFAULT_RETENTION_DAYS);
      })
      .catch((err: unknown) => { toastError(err, `${ACT[kind].title} refused`); })
      .finally(() => { setBusy(false); });
  };

  /** Open the shared dialog on one act, with a clean reason box. */
  const ask = (p: Project, kind: ActKind) => {
    setActing({ p, kind });
    setNote('');
    setDays(DEFAULT_RETENTION_DAYS);
  };

  // Whether the retention period as typed is one the system accepts, and the
  // date it produces. Both from `domain/retention.ts`, which is also what the
  // API and the database bound the act with — a form with its own idea of
  // thirty days would be a form that offers what the server refuses.
  const daysProblem = acting?.kind === 'delete' ? retentionProblem(days) : null;
  const untilLabel = new Date(now + Math.max(0, days) * 86_400_000)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const willPropose = acting
    ? proposes(mutationFor(acting.kind, acting.p.id, 'x', days).kind)
    : false;

  // Into the WORKSPACE, not the standalone Overview — which is the workspace's
  // first tab. Drilling from the portfolio into a development lands on the
  // development, with its modules and its reporting calendar around it.
  const open = (p: typeof projects[number]) => openScoped('workspace', {
    level: 'Project', portfolio: p.portfolio, project: p.id,
  });

  return (
    <div className="fade-up">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        {/* The whole register, deliberately: this screen has its own portfolio
            tabs below and ignores the scope selector — but four tiles labelled
            the same as the Dashboard's scoped ones, with different figures,
            read as a contradiction unless the tile says which it is. */}
        <KPI icon="projects" label="Total Projects" value={a.count}
          sub={`Whole register · ${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'}`} tone="blue" />
        <KPI icon="check" label="On Track" value={a.onTrack}
          sub={`${pct(a.onTrack, a.count)} of total`} tone="green" />
        <KPI icon="clock" label="At Risk" value={a.atRisk}
          sub={`${pct(a.atRisk, a.count)} of total`} tone="amber" />
        <KPI icon="alert" label="Delayed" value={a.delayed}
          sub={`${pct(a.delayed, a.count)} of total`} tone="red" />
      </div>

      <div className="card">
        <div className="card-b">
          <div className="tabs">
            {tabs.map((t) => {
              const n = t === ALL ? live.length
                : t === COMPLETED ? closed.length
                  : t === ARCHIVE ? archived.length
                    : live.filter((p) => p.portfolio === t).length;
              return (
                <button key={t} type="button" className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                  {`${t === ALL ? 'All Projects' : t} (${n})`}
                </button>
              );
            })}
          </div>

          {tab === ARCHIVE ? (
            <ArchiveTable
              rows={archived}
              now={now}
              log={log}
              portfolios={portfolios}
              canPurge={canRemove}
              busy={busy}
              onAct={ask}
            />
          ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="click" onClick={() => open(p)}>
                    <td><span className="tid">{p.id}</span></td>
                    <td>{p.name}</td>
                    <td><span className="pill" style={pillStyle(portfolios, p.portfolio)}>{p.portfolio}</span></td>
                    <td>{p.route}</td>
                    <td>{p.pmc}</td>
                    <td>{fmt(p.budget)}</td>
                    <td>{fmt(p.afc)}</td>
                    <td><span style={{ color: varianceColour(p.budget - p.afc), fontWeight: 600 }}>{fmt(p.budget - p.afc)}</span></td>
                    <td>
                      {p.closedAt
                        ? (
                          <span className="pill b-green" title={p.closeNote ?? ''}>
                            {`Closed ${p.closedAt.slice(0, 10)}`}
                          </span>
                        )
                        : <Badge status={p.status} />}
                    </td>
                    <td><Prog v={progressOf(p)} /></td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 30, height: 30 }}
                          title={`Open ${p.id}`}
                          onClick={(e) => { e.stopPropagation(); open(p); }}
                        >
                          {Ic('eye', 16)}
                        </button>
                        {/* A closed development is frozen: amending its
                            details or deleting it are not offered, because
                            the server refuses both. Reopening is the one act
                            it has, and it is the way back to all the rest. */}
                        {canRetire && !p.closedAt && (
                          <button type="button" className="icon-btn" style={{ width: 30, height: 30 }}
                            title={`Amend ${p.id}`} aria-label={`Amend ${p.id}`}
                            onClick={(e) => { e.stopPropagation(); setEditing(p); }}>
                            {Ic('edit', 16)}
                          </button>
                        )}
                        {canRetire && !p.closedAt && (
                          <button type="button" className="icon-btn" style={{ width: 30, height: 30 }}
                            title={`Close ${p.id} out`} aria-label={`Close ${p.id} out`}
                            onClick={(e) => { e.stopPropagation(); ask(p, 'close'); }}>
                            {Ic('check', 16)}
                          </button>
                        )}
                        {canRetire && p.closedAt && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '6px 11px' }}
                            disabled={busy}
                            onClick={(e) => { e.stopPropagation(); ask(p, 'reopen'); }}>
                            Reopen
                          </button>
                        )}
                        {canRetire && !p.closedAt && (
                          <button type="button" className="icon-btn" style={{ width: 30, height: 30 }}
                            title={`Delete ${p.id}`} aria-label={`Delete ${p.id}`}
                            onClick={(e) => { e.stopPropagation(); ask(p, 'delete'); }}>
                            {Ic('archive', 16)}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                    {tab === COMPLETED
                      ? 'Nothing has been closed out yet.'
                      : 'No developments to show.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          <div className="between" style={{ marginTop: 14 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              {tab === ARCHIVE
                ? `${archived.length} deleted development${archived.length === 1 ? '' : 's'}, outside every roll-up`
                : tab === COMPLETED
                  ? `${closed.length} development${closed.length === 1 ? '' : 's'} delivered · `
                    + `Approved Budget ${fmt(done.budget)} · Final Cost ${fmt(done.afc)} · `
                    + `Variance ${fmt(done.variance)} — read-only, and outside the portfolio figures above`
                  : `Showing ${list.length} of ${live.length} development${live.length === 1 ? '' : 's'} in delivery`}
            </span>
          </div>
        </div>
      </div>

      {editing && <EditProject p={editing} onClose={() => setEditing(null)} />}

      {acting && (
        <div className="modal-scrim" onClick={busy ? undefined : () => setActing(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="act-title"
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <h2 id="act-title">{`${ACT[acting.kind].title} ${acting.p.id}`}</h2>
              <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Cancel"
                onClick={() => setActing(null)}>{Ic('x', 17)}</button>
            </div>
            <div className="modal-b">
              <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                {ACT[acting.kind].explain(acting.p)}
              </p>
              <div className="form-field full" style={{ marginTop: 12 }}>
                <label htmlFor="act-note">
                  {`${ACT[acting.kind].ask} `}<span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <textarea id="act-note" rows={3} maxLength={2000} value={note}
                  aria-describedby="act-note-hint" required
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={ACT[acting.kind].placeholder}
                  style={{ font: 'inherit', fontSize: 12.5, border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px' }} />
                {/* WHY A DISABLED BUTTON HAS TO EXPLAIN ITSELF.
                    The reason is required — it is the whole audit value of the
                    act — and the button was simply dead until one was typed,
                    with nothing on screen saying so. The owner reported it as
                    "the archive button is not working at all", which is exactly
                    what a control that refuses without a reason looks like. */}
                <div id="act-note-hint" className="form-hint">
                  {note.trim()
                    ? 'This is written into the change log and shown against the development.'
                    : `Required. ${ACT[acting.kind].title} is not available until a reason is given `
                      + '— it is written into the change log.'}
                </div>
              </div>

              {/* HOW LONG IT IS KEPT. Asked rather than assumed, on the
                  owner's instruction, and floored at thirty days in the same
                  constant the API and the database bound it with — so the
                  form cannot offer a period the server would refuse. */}
              {acting.kind === 'delete' && (
                <div className="form-field full" style={{ marginTop: 12 }}>
                  <label htmlFor="act-days">
                    {'Keep it in the Archive for '}<span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <div className="row" style={{ gap: 9 }}>
                    <input id="act-days" type="number" inputMode="numeric"
                      min={MIN_RETENTION_DAYS} max={MAX_RETENTION_DAYS} step={1}
                      value={Number.isFinite(days) ? days : ''}
                      aria-describedby="act-days-hint"
                      onChange={(e) => setDays(Math.trunc(Number(e.target.value)))}
                      style={{ width: 120, border: '1px solid var(--line)', borderRadius: 9,
                        padding: '9px 11px', fontSize: 12.5 }} />
                    <span className="muted" style={{ fontSize: 12.5 }}>days</span>
                    {/* The three periods people actually mean. Typing is still
                        the way to say anything else. */}
                    {[30, 90, 365].map((d) => (
                      <button key={d} type="button" className="btn btn-ghost"
                        style={{ padding: '6px 11px' }} onClick={() => setDays(d)}>
                        {d === 365 ? '1 year' : `${d} days`}
                      </button>
                    ))}
                  </div>
                  <div id="act-days-hint" className="form-hint">
                    {daysProblem
                      ?? `Restorable in one click until ${untilLabel}. After that it can only be `
                        + 'removed permanently, by an administrator.'}
                  </div>
                </div>
              )}

              {/* WHAT PRESSING THIS ACTUALLY DOES, for a seat that proposes
                  rather than acts. Saying it here — before the button — is
                  the difference between a person choosing to send something
                  for authorisation and one discovering afterwards that
                  nothing moved. */}
              {willPropose && (
                <p className="form-hint" style={{ marginTop: 12 }}>
                  {`Your seat proposes this change; the Director authorises it. Nothing moves `
                    + 'until they do, and the reason above is what they will read.'}
                </p>
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="btn btn-ghost" disabled={busy}
                onClick={() => setActing(null)}>Cancel</button>
              <button type="button" className="btn btn-gold"
                disabled={busy || !note.trim() || daysProblem !== null}
                onClick={() => act(acting.kind, acting.p)}>
                {Ic(ACT[acting.kind].icon, 15)}
                {busy
                  ? ACT[acting.kind].busy
                  : willPropose ? `Send ${ACT[acting.kind].title.toLowerCase()} for authorisation`
                    : ACT[acting.kind].cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
