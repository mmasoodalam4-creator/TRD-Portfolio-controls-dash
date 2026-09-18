// ==========================================================================
// THE PROJECT WORKSPACE
//
// One development, every module, every month, on one screen.
//
// The complaint this answers is that Period Entry was a form on its own: to
// file a month a project manager had to know which figures came from which
// register, open each one from the sidebar, and carry the numbers across. The
// workspace turns that around — the development is the screen, the modules are
// tabs across the top, and the reporting calendar sits under them, so entering
// a period happens beside the registers it has to agree with.
//
// IT RENDERS THE EXISTING MODULES. Cost, Quality, Claims and the rest are the
// same components the sidebar routes to, shown here inside a development. That
// is deliberate and it is the reason this is safe to add: there is still one
// implementation of every figure, one set of reconciliation controls, and one
// set of gates over them. What the sidebar keeps is the ROLL-UP — the same
// modules at portfolio and corporate level, where a figure is the sum of the
// developments under it and there is nothing to enter.
//
// The band is drawn here rather than by the module (see `host.ts`), so the
// order is band, tabs, months, module — with each module's own band metrics
// intact.
// ==========================================================================
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PageId, NavFn } from '@/app/types';
import { fmt } from '@/domain/format';
import { useScope } from '@/state/ScopeProvider';
import { useMutations } from '@/state/DataProvider';
import { useAuth } from '@/state/AuthProvider';
import { Ic } from '@/components';
import { EditProject } from '@/features/edit-project/EditProject';
import { ProjBand, bandMetrics, PickDevelopment } from '../shared';
import { DATA_DATE_MS } from '@/domain/calendar';
import { positionOfProject } from '@/domain/position';
import { BandHostContext, type BandHost } from './host';
import { Reopen } from './Reopen';
import { WS_MODULES, isWsModule, MONTHS } from './tabs';
import {
  MONTH_LABEL, monthsFor, yearsFor, periodNumberFor, dataDateFor, type MonthCell,
} from './periods';
import { Overview } from '../Overview';
import { PeriodEntry } from '../PeriodEntry';
import { Wbs } from '../Wbs';
import { Cost } from '../cost/Cost';
import { Variations } from '../Variations';
import { ChangeLog } from '../ChangeLog';
import { Procurement } from '../Procurement';
import { Claims } from '../Claims';
import { Manpower } from '../Manpower';
import { Equipment } from '../Equipment';
import { Quality } from '../Quality';
import { Hse } from '../Hse';
import { Risk } from '../Risk';
import { Issues } from '../Issues';
import { Documents } from '../Documents';

interface Props {
  nav: NavFn;
  canEdit: boolean;
  /** The seat that may amend a development's description — approver or admin. */
  canAmend: boolean;
  openAI: () => void;
}

/** The three stages every period passes through, and where this one is. */
function Chain({ cell }: { cell: MonthCell }) {
  const s = cell.submission;
  const done = (v: string | null) => (v ? 'done' : 'todo');
  const stages: [string, string, string][] = s
    ? [
      ['done', 'Entered', s.submittedBy],
      [s.state === 'submitted' ? 'now' : done(s.reviewedBy), 'Validated', s.reviewedBy ?? 'with the reviewer'],
      [s.state === 'reviewed' ? 'now' : done(s.approvedBy), 'Approved', s.approvedBy ?? 'with the approver'],
    ]
    : [
      ['todo', 'Entered', cell.state === 'future' ? `opens 1 ${cell.label}` : 'nothing filed'],
      ['todo', 'Validated', ''],
      ['todo', 'Approved', ''],
    ];
  return (
    <div className="ws-chain">
      {stages.map(([k, t, who], i) => (
        <div className={`ws-stage ${k}`} key={t}>
          <span className="ic">{k === 'done' ? '✓' : i + 1}</span>
          <span className="who"><b>{t}</b><span>{who}</span></span>
        </div>
      ))}
    </div>
  );
}

export function Workspace({ nav, canEdit, canAmend, openAI }: Props) {
  const { scope, project: p } = useScope();
  const { submissions } = useMutations();
  const { authRequired, can } = useAuth();
  const [params, setParams] = useSearchParams();

  // The band is portalled in by whichever module is showing. `slot` is the
  // element it lands in; `hosted` counts the bands that have claimed it, so
  // the default band below stands down the moment a module supplies its own.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [hosted, setHosted] = useState(0);
  const [amending, setAmending] = useState(false);
  const register = useCallback(() => {
    setHosted((n) => n + 1);
    return () => { setHosted((n) => n - 1); };
  }, []);
  const host = useMemo<BandHost>(() => ({ slot, register }), [slot, register]);

  // THE REPORTING CALENDAR'S "NOW", NEVER THE WALL CLOCK'S. The data date is
  // a constant (domain/calendar.ts) and everything else in the build is
  // measured from it; this screen ran on `new Date()`, so it opened on
  // whatever month the machine said — September, with "Nothing filed", while
  // the position it hosts is as at 31 August — and quietly moved every month.
  // A strip that reports a different month than the position beneath it is
  // the calendar contradicting itself, and it broke the determinism the pixel
  // gates rely on. When periods are filed the strip follows THEM, which is
  // the reporting calendar moving for the right reason.
  const today = useMemo(() => new Date(DATA_DATE_MS), []);
  const years = useMemo(() => yearsFor(p, submissions, today), [p, submissions, today]);
  const year = Number(params.get('year')) || today.getUTCFullYear();
  const cells = useMemo(() => monthsFor(p, submissions, year, today), [p, submissions, year, today]);

  // Number(null) is 0 — a VALID month — so an absent parameter used to read
  // as January and the fallback below never ran: the workspace always opened
  // on January, and Monthly Reporting seeded "31 January" as the data date of
  // a period being filed in August. Absent must stay absent.
  const monthParam = params.get('month');
  const rawMonth = monthParam === null ? NaN : Number(monthParam);
  const month = Number.isInteger(rawMonth) && rawMonth >= 0 && rawMonth <= 11
    ? rawMonth
    : (year === today.getUTCFullYear() ? today.getUTCMonth() : 0);
  const cell = cells[month];

  const raw = params.get('mod');
  const modules = WS_MODULES.filter((m) => !m.needs || !authRequired || m.needs(can));
  const mod: PageId = isWsModule(raw) && modules.some((m) => m.id === raw) ? raw : 'overview';

  /**
   * Set one of the workspace's own parameters.
   *
   * Changing module clears the module-specific ones — `tab` belongs to Cost,
   * and carrying it into Quality is how a screen opens on a tab it does not
   * have.
   */
  const set = (patch: Record<string, string | null>, clearTab = false) => {
    setParams((prev) => {
      const q = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      if (clearTab) q.delete('tab');
      return q;
    }, { replace: true });
  };

  const body = () => {
    switch (mod) {
      case 'period': return (
        <PeriodEntry
          defaultPeriod={periodNumberFor(p, year, month)}
          defaultDataDate={dataDateFor(year, month)}
        />
      );
      case 'wbs': return <Wbs />;
      case 'cost': return <Cost canEdit={canEdit} />;
      case 'variations': return <Variations />;
      case 'change': return <ChangeLog />;
      case 'procurement': return <Procurement />;
      case 'claims': return <Claims />;
      case 'manpower': return <Manpower />;
      case 'equipment': return <Equipment />;
      case 'quality': return <Quality />;
      case 'hse': return <Hse />;
      case 'risk': return <Risk />;
      case 'issues': return <Issues />;
      case 'documents': return <Documents openAI={openAI} canEdit={canEdit} />;
      default: return <Overview nav={nav} />;
    }
  };

  // A WORKSPACE IS ONE DEVELOPMENT, AND IT DOES NOT HELP ITSELF TO ONE.
  //
  // Switching the scope on arrival was tried and is worse than it looks: scope
  // lives in the URL and travels with every navigation, so opening this screen
  // once would quietly filter Payment Claims, Analytics and everything else to
  // a single development for the rest of the session. The pixel gate is what
  // found it — twenty screens moved, none of them touched.
  //
  // So the screen asks. One click, visible, and the top bar then says which
  // development is open and offers the others.
  if (scope.level !== 'Project') {
    return (
      <PickDevelopment
        what={'The workspace is one development at a time — its modules, its reporting calendar '
          + 'and the period being filed against it.'}
      />
    );
  }

  return (
    <BandHostContext.Provider value={host}>
      <div className="fade-up">
        <div ref={setSlot} />
        {/* The default band, for the modules that draw none of their own —
            Monthly Reporting, WBS, Documents. Rendered with the host context
            switched OFF, or it would portal into the slot it is standing in
            for and register as the band it is waiting on. */}
        {hosted === 0 && (
          <BandHostContext.Provider value={undefined}>
            <ProjBand p={p} metrics={bandMetrics(positionOfProject(p))} />
          </BandHostContext.Provider>
        )}

        {/* AMENDING THE DEVELOPMENT, from the development. The capability
            already existed on the Projects list; a person who is standing
            inside RES-01 and wants to correct its name should not have to
            leave it to do so. The seat rule is the same one Projects uses, and
            the server refuses anyone else whatever this shows. */}
        {canAmend && !p.closedAt && (
          <div className="ws-actions">
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => { setAmending(true); }}>
              {Ic('edit', 14)}Amend details
            </button>
          </div>
        )}
        {amending && <EditProject p={p} onClose={() => { setAmending(false); }} />}

        <div className="ws-tabs" role="tablist" aria-label="Project modules">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              className={`ws-tab${mod === m.id ? ' active' : ''}`}
              aria-selected={mod === m.id}
              onClick={() => { set({ mod: m.id }, true); }}
            >
              <span className="ic">{Ic(m.icon, 15)}</span>
              {m.label}
            </button>
          ))}
        </div>

        <div className="ws-periods">
          <div className="ws-per-top">
            <div className="ws-years">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={y === year ? 'on' : ''}
                  onClick={() => { set({ year: String(y) }); }}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="ws-legend">
              {(['approved', 'awaiting', 'returned', 'open', 'none', 'future'] as const)
                .map((s) => (
                  <span key={s}><i className={`d-${s}`} />{MONTH_LABEL[s]}</span>
                ))}
            </div>
          </div>
          <div className="ws-months">
            {cells.map((c) => (
              <button
                key={c.label}
                type="button"
                className={`ws-mo s-${c.state}${c.index === month ? ' on' : ''}`}
                aria-pressed={c.index === month}
                onClick={() => { set({ month: String(c.index) }); }}
              >
                <span className="m">{c.label}</span>
                <span className="st">{MONTH_LABEL[c.state]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ws-bar">
          <Chain cell={cell} />
          <div className="ws-bar-right">
            {/* AN APPROVED MONTH IS FINAL, and the way back is here rather
                than only in a queue. The PMO manager returns it; anybody else
                asks them to. See Reopen.tsx. */}
            {cell.state === 'approved' && cell.submission && (
              <Reopen p={p} submission={cell.submission}
                period={`${MONTHS[month]} ${year}`} />
            )}
            <span className={`badge b-${cell.state === 'approved' ? 'green'
              : cell.state === 'awaiting' ? 'amber'
                : cell.state === 'returned' ? 'red'
                  : cell.state === 'open' ? 'blue' : 'grey'}`}
            >
              {`${MONTHS[month]} ${year} — ${MONTH_LABEL[cell.state]}`}
            </span>
            <span className="muted ws-note">
              {cell.state === 'approved'
                ? 'This period is approved and its figures are final.'
                : cell.state === 'future'
                  ? 'This month has not started. Nothing is reported against it yet.'
                  : mod === 'period'
                    ? 'The month selected above is the period this form files.'
                    : 'Registers show the current position. The strip above is the reporting calendar.'}
            </span>
          </div>
        </div>

        <div className="ws-body">{body()}</div>

        {p.closedAt && (
          <p className="muted ws-foot">
            {`${p.id} was closed out on ${p.closedAt.slice(0, 10)} and accepts no further `
              + `periods, certificates, claims or variations. Everything here is readable, `
              + `and its figures are the record of what was spent — `
              + `${fmt(p.actual)} SAR against an approved budget of ${fmt(p.budget)}.`}
          </p>
        )}
      </div>
    </BandHostContext.Provider>
  );
}
