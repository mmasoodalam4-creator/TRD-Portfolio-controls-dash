import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '@/domain/types';
import type { ScopePosition } from '@/domain/position';
import { positionOfProject } from '@/domain/position';
import { fmt } from '@/domain/format';
import { Badge, Ic } from '@/components';
import { usePosition, useScope } from '@/state/ScopeProvider';
import { useBandHost } from './workspace/host';

/**
 * Placeholder project image, inlined as a data URI so the deliverable stays a
 * single portable file with no asset requests.
 */
export const THUMB =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='66'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#2b5b8f'/><stop offset='1' stop-color='#13315c'/></linearGradient></defs><rect width='96' height='66' fill='url(#g)'/><rect x='14' y='28' width='14' height='30' fill='#7fa8d4'/><rect x='32' y='18' width='16' height='40' fill='#9dc0e6'/><rect x='52' y='24' width='14' height='34' fill='#7fa8d4'/><rect x='70' y='14' width='14' height='44' fill='#b4d3f0'/></svg>`,
  );

export function ProjThumb() {
  return <img className="proj-thumb" src={THUMB} alt="" />;
}

/** A metric on the band: [label, value, optional colour]. */
export type BandMetric = [string, ReactNode] | [string, ReactNode, string];

/**
 * Header band across every module.
 *
 * A CLOSED DEVELOPMENT SAYS SO HERE, on every screen, rather than only on the
 * Projects list. It is the same figures in the same places — that is the point
 * of keeping it readable — so without a marker at the top of each screen there
 * is nothing to tell a reader that what they are looking at is a finished
 * record rather than this month's position. The health badge is replaced
 * rather than joined: "On Track" is a statement about work in progress, and on
 * a development that finished a year ago it is noise at best.
 */
export function ScopeBand({ metrics }: { metrics: (pos: ScopePosition) => BandMetric[] }) {
  const pos = usePosition();
  return <Band pos={pos} metrics={metrics(pos)} />;
}

/**
 * The band for ONE development, whatever the selector says.
 *
 * Overview and the Project Workspace are about a single development by
 * definition — the workspace refuses to open without one — so they say so
 * rather than going through the scope.
 */
export function ProjBand({ p, metrics }: { p: Project; metrics: BandMetric[] }) {
  return <Band pos={positionOfProject(p)} metrics={metrics} />;
}

function Band({ pos, metrics }: { pos: ScopePosition; metrics: BandMetric[] }) {
  // Inside the Project Workspace this band belongs above the module tab row,
  // not at the top of the module. See `workspace/host.ts` — the metrics stay
  // defined in the module that knows what they mean, and only the place they
  // are drawn moves.
  const host = useBandHost();
  // On `register` alone, not on `host`: the host object changes identity when
  // its slot mounts, and re-running the registration on that would take the
  // count to zero for one flush — long enough for the workspace's own default
  // band to appear beside this one.
  const register = host?.register;
  useEffect(() => register?.(), [register]);
  const p = pos.project;
  const band = (
    <div className="proj-band">
      <ProjThumb />
      <div style={{ flex: 1 }}>
        <div className="proj-head-main">
          <span className="pid">{pos.id}</span>
          <span className="pname">{pos.name}</span>
          {p
            ? (p.closedAt
              ? (
                <span className="pill b-green" title={p.closeNote ?? ''}>
                  {`Closed out ${p.closedAt.slice(0, 10)}`}
                </span>
              )
              : <Badge status={p.status} />)
            : <span className="pill b-blue">{`${pos.count} development${pos.count === 1 ? '' : 's'}`}</span>}
        </div>
        {p?.closedAt && (
          <div className="closed-note">
            {`Delivered and closed out. These figures are final — this development no longer `
              + `accepts periods, certificates, claims or variations, and is outside the `
              + `portfolio roll-ups.${p.closeNote ? ` ${p.closeNote}` : ''}`}
          </div>
        )}
        <div className="proj-metrics">
          {metrics.map((m, i) => (
            <div className="pm-item" key={i}>
              <div className="pm-l">{m[0]}</div>
              <div className="pm-v" style={m[2] ? { color: m[2] } : {}}>{m[1]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (host === undefined) return band;
  return host.slot ? createPortal(band, host.slot) : null;
}

/**
 * What identifies the scope, then whatever the module wants to add.
 *
 * At Project level that is the development's portfolio, route and delivery
 * partner. At a roll-up those three are properties of eight developments
 * rather than of one, so the same three slots carry HOW MANY there are of
 * each — which is the same question answered at the level being asked.
 */
export const bandMetrics = (pos: ScopePosition, extra?: BandMetric[]): BandMetric[] => [
  ...(pos.project
    ? ([
      ['Portfolio', pos.project.portfolio],
      ['Delivery Route', pos.project.route],
      ['PMC / Internal', pos.project.pmc],
    ] as BandMetric[])
    : ([
      ['Developments', String(pos.count)],
      ['Scope', pos.level === 'Portfolio' ? pos.id : 'All four portfolios'],
      ['Control Budget (SAR)', fmt(pos.control)],
    ] as BandMetric[])),
  ['Approved Budget (SAR)', fmt(pos.budget)],
  ...(extra ?? []),
];

/**
 * Identity of a register row when several developments are in scope.
 *
 * The registers are derived from one template, so ISS-009 exists on all eight
 * developments — a React key or a selection test on the id alone would match
 * the wrong row, highlight two at once, and open the drawer on whichever
 * rendered first. The development is what makes it unique.
 */
export const rowKey = (id: string, row?: { project?: string }): string =>
  (row?.project ? `${row.project}/${id}` : id);

/** The development column, shown only where the table is showing several. */
export const DEV_COLUMN = 'Development';

/**
 * WHAT A ONE-DEVELOPMENT SCREEN SHOWS WHEN THE SCOPE IS NOT ONE DEVELOPMENT.
 *
 * Two screens are about a single development by definition — the Project
 * Workspace and the Project Overview drill-in — and neither may help itself to
 * one. Scope lives in the URL and travels with every navigation, so switching
 * it on arrival would quietly filter Payment Claims, Analytics and everything
 * else to that development for the rest of the session; the pixel gate caught
 * exactly that when the workspace tried it.
 *
 * So the screen ASKS, in one click. Written once here because the alternative
 * is two cards free to say different things: the Overview drill-in still
 * rendered RES-01 under a Corporate selector after the modules were rolled up,
 * which is the same defect the owner reported, on the one screen that had no
 * roll-up to move to.
 */
export function PickDevelopment({ what }: { what: string }) {
  const { scope, project, updateScope } = useScope();
  return (
    <div className="card fade-up"><div className="card-b">
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Choose a development</h3>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, maxWidth: '68ch' }}>
        {what} The scope is currently
        {` ${scope.level.toLowerCase()}`}, which is the right level for the roll-ups in
        the sidebar and the wrong one for a single development.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 14 }}
        onClick={() => { updateScope({ level: 'Project' }); }}
      >
        {Ic('projects', 15)}
        {`Open ${project.id} — ${project.name}`}
      </button>
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
        Any other development is a change of scope in the top bar.
      </p>
    </div></div>
  );
}
