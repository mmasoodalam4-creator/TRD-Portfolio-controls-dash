import { useState } from 'react';
import type { Ncr } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { pct } from '@/domain/format';
import {
  KPI, Badge, Filters, applyFilters, Drawer, kvGrid, docList, AuditTimeline, Donut, LineChart,
  BarChart,
} from '@/components';
import { countBy, CATEGORY_COLOURS } from '@/components/charts/breakdown';
import { isOpenNcr } from '@/domain/counts';
import { useScope, useScopedRegisters, useScopedHistory } from '@/state/ScopeProvider';
import { useAuditFor } from '@/state/DataProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';
import { SubTabs, useSubTab } from './subtabs';
import { MONTH_AXIS } from '@/domain/calendar';

const TABS = ['Non-Conformances', 'Corrective Actions', 'Inspections', 'Material Approvals'] as const;

const COLUMNS = ['NCR No.', 'Title / Description', 'Discipline', 'Type', 'Severity', 'Raised On',
  'Due Date', 'Status', 'Responsible'];

/** Distinct values of one field, in register order, for a filter. */
const options = <T,>(rows: T[], pick: (r: T) => string): string[] =>
  ['All', ...Array.from(new Set(rows.map(pick)))];

/** Inspections and non-conformance. */
export function Quality() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';

  const {
    ncrs: nc, correctiveActions, qualityInspections, materialApprovals,
  } = useScopedRegisters();
  const [view, setView] = useSubTab(TABS);
  const history = useScopedHistory();
  // The months each register actually covers. A chart drawn across months a
  // register says nothing about invites a reader to read the silence as a
  // figure — an empty January as a January with nothing wrong in it.
  const inspected = history.filter((m) => m.firstTimeRight !== null);
  const raisedIn = history.filter((m): m is typeof m & { ncrsRaised: number } => m.ncrsRaised !== null);

  const passed = qualityInspections.filter((q) => q.result === 'Passed').length;
  const withComments = qualityInspections.filter((q) => q.result === 'Passed with comments').length;
  const failed = qualityInspections.filter((q) => q.result === 'Failed').length;
  // NULL WHERE NOTHING WAS INSPECTED. A development with no inspections used
  // to report 100% first time right, which reads as a perfect record and is
  // actually an absence of one.
  const firstTimeRight = qualityInspections.length
    ? Math.round((passed / qualityInspections.length) * 100) : null;
  const [sel, setSel] = useState<Scoped<Ncr> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const rows = applyFilters(nc, filters, { Status: 'status', Discipline: 'discipline', Severity: 'severity' });
  // The trail of whichever development the open row belongs to.
  const audit = useAuditFor(sel?.project ?? scope.project);

  // Every count is from the register. These were literals that reported 245
  // inspections and 18 open NCRs on every development.
  const open = nc.filter(isOpenNcr).length;
  const overdue = nc.filter((n) => n.status === 'Overdue').length;
  const closed = nc.filter((n) => !isOpenNcr(n)).length;
  const major = nc.filter((n) => n.severity === 'Major').length;
  const minor = nc.filter((n) => n.severity === 'Minor').length;

  // The two breakdowns the owner approved, counted from the register rather
  // than written down beside it. `type` is the root cause the NCR was raised
  // under — workmanship, material, installation, documentation.
  const byDiscipline = countBy(nc, (n) => n.discipline);
  const byCause = countBy(nc, (n) => n.type);

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['NCRs Raised', String(nc.length)],
        ['Open NCRs', String(open), open ? 'var(--red)' : 'var(--green)'],
        ['Overdue', String(overdue), overdue ? 'var(--red)' : 'var(--green)'],
      ])} />

      <SubTabs
        tabs={TABS}
        active={view}
        onSelect={setView}
        counts={{
          'Non-Conformances': nc.length,
          'Corrective Actions': correctiveActions.length,
          Inspections: qualityInspections.length,
          'Material Approvals': materialApprovals.length,
        }}
      />

      {view === 'Inspections' && (
        <div className="card">
          <div className="card-h">
            <h3>Inspection Log</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>a failed inspection is where a non-conformance comes from</span>
          </div>
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="quality" label="Inspections" value={qualityInspections.length} sub={rolledUp ? 'In scope' : 'On this development'} tone="blue" />
              <KPI
                icon="check"
                label="First Time Right"
                value={firstTimeRight === null ? '—' : `${firstTimeRight}%`}
                sub={firstTimeRight === null ? 'No inspections recorded' : `${passed} passed outright`}
                tone={firstTimeRight === null ? 'navy' : firstTimeRight >= 85 ? 'green' : 'amber'}
              />
              <KPI icon="alert" label="Passed with Comments" value={withComments} sub="Minor items closed on site" tone="amber" />
              <KPI icon="x" label="Failed" value={failed} sub="Each one raised an NCR" tone="red" />
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Ref', 'Date', 'Activity', 'Discipline',
                    'Location', 'Result', 'Inspector', 'NCR raised'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {qualityInspections.map((q) => (
                    <tr key={rowKey(q.id, q)}>
                      {rolledUp && <td><span className="tid">{q.project}</span></td>}
                      <td><span className="tid">{q.id}</span></td>
                      <td>{q.date}</td>
                      <td>{q.activity}</td>
                      <td>{q.discipline}</td>
                      <td>{q.location}</td>
                      <td>
                        <Badge
                          status={q.result === 'Passed' ? 'On Track' : q.result === 'Failed' ? 'Overdue' : 'At Risk'}
                          label={q.result}
                        />
                      </td>
                      <td>{q.inspector}</td>
                      <td>{q.ncr ? <span className="tid">{q.ncr}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                  {qualityInspections.length === 0 && (
                    <tr><td colSpan={rolledUp ? 9 : 8} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      No inspections are recorded on this development.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              {firstTimeRight === null
                ? 'No inspection has been carried out on this scope yet, so there is no first-time-right to report.'
                : `Every failure here carries the non-conformance it raised, so first-time-right — `
                  + `${firstTimeRight}% — traces back to ${failed} named defects rather than to a figure `
                  + 'nobody can follow.'}
            </p>
          </div>
        </div>
      )}

      {view === 'Material Approvals' && (
        <div className="card">
          <div className="card-h">
            <h3>Material Approvals</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>nothing is installed against a rejected or pending submittal</span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Ref', 'Material', 'Supplier',
                    'Submitted', 'Decision', 'Decided'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {materialApprovals.map((m) => (
                    <tr key={rowKey(m.id, m)}>
                      {rolledUp && <td><span className="tid">{m.project}</span></td>}
                      <td><span className="tid">{m.id}</span></td>
                      <td><b>{m.material}</b></td>
                      <td>{m.supplier}</td>
                      <td>{m.submitted}</td>
                      <td>
                        <Badge
                          status={m.decision === 'Approved' ? 'Approved'
                            : m.decision === 'Rejected' ? 'Rejected' : 'Under Review'}
                          label={m.decision}
                        />
                      </td>
                      <td>{m.decided ?? <span className="muted">awaiting</span>}</td>
                    </tr>
                  ))}
                  {materialApprovals.length === 0 && (
                    <tr><td colSpan={rolledUp ? 7 : 6} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      No material submittals are recorded on this development.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              This register is where a programme slips before anybody can see it. A rejected
              submittal is a delay that has already happened and is not yet in the schedule.
            </p>
          </div>
        </div>
      )}

      {view === 'Corrective Actions' && (
        <div className="card">
          <div className="card-h">
            <h3>Corrective Actions</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>every action answers a named non-conformance</span>
          </div>
          <div className="card-b">
            {correctiveActions.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                No non-conformance is recorded on this development, so there is nothing to correct.
              </p>
            ) : (
              <>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 14 }}>
                  <KPI icon="quality" label="Open Actions"
                    value={correctiveActions.filter((c) => c.status !== 'Closed').length}
                    sub="Against open non-conformances" tone="blue" />
                  <KPI icon="clock" label="Overdue"
                    value={correctiveActions.filter((c) => c.status === 'Overdue').length}
                    sub="Past the agreed date" tone="red" />
                  <KPI icon="check" label="Verified Effective"
                    value={correctiveActions.filter((c) => c.verification !== null).length}
                    sub="Somebody checked it worked" tone="green" />
                  <KPI icon="alert" label="Awaiting Verification"
                    value={correctiveActions.filter((c) => c.status === 'Closed' && c.verification === null).length}
                    sub="Closed, not yet confirmed" tone="amber" />
                </div>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Action', 'Against',
                        'What was directed', 'Owner', 'Due', 'Status',
                        'Verification'].map((x) => <th key={x}>{x}</th>)}</tr>
                    </thead>
                    <tbody>
                      {correctiveActions.map((c) => (
                        <tr key={rowKey(c.id, c)}>
                          {rolledUp && <td><span className="tid">{c.project}</span></td>}
                          <td><span className="tid">{c.id}</span></td>
                          <td><span className="tid">{c.ncr}</span></td>
                          <td style={{ whiteSpace: 'normal', maxWidth: 400 }}>{c.action}</td>
                          <td>{c.owner}</td>
                          <td style={{ color: c.status === 'Overdue' ? 'var(--red)' : 'inherit' }}>{c.due}</td>
                          <td><Badge status={c.status} /></td>
                          <td>
                            {c.verification
                              ? <span style={{ color: 'var(--green)', fontSize: 11.5 }}>{c.verification}</span>
                              : <span className="muted" style={{ fontSize: 11.5 }}>Not yet verified</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
                  An action closes only when a verification is recorded. Without that step a
                  non-conformance marked closed means somebody filed it, not that the defect was
                  fixed &mdash; and a first-time-right figure built on those measures paperwork.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {view === 'Non-Conformances' && (
      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="quality" label="NCRs Raised" value={nc.length} sub={rolledUp ? 'In scope' : 'On this development'} tone="blue" />
              <KPI icon="check" label="Closed" value={closed} sub={`${pct(closed, nc.length)} of raised`} tone="green" />
              <KPI icon="alert" label="Minor NCRs" value={minor} sub={`${pct(minor, nc.length)} of raised`} tone="amber" />
              <KPI icon="x" label="Major NCRs" value={major} sub={`${pct(major, nc.length)} of raised`} tone="red" />
              <KPI icon="clock" label="Overdue" value={overdue} sub="Past due date" tone="red" />
            </div>

            {nc.length > 0 && (
              <div
                className="grid"
                style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, marginBottom: 16 }}
              >
                <div className="card">
                  <div className="card-h"><h3>NCRs by Discipline</h3></div>
                  <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
                    <Donut data={byDiscipline} total={String(nc.length)} label="NCRs" size={140} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-h"><h3>NCRs by Root Cause</h3></div>
                  <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
                    <Donut data={byCause} total={String(nc.length)} label="NCRs" size={140} />
                  </div>
                </div>
              </div>
            )}

            {nc.length > 0 && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
                {/* TWO CHARTS, NOT ONE WITH TWO SCALES.
                    A percentage and a count of non-conformances used to share
                    a single 0-100 axis, with the count multiplied by whatever
                    factor made it fit — x8 at Corporate, x30 on a development.
                    Every gridline then meant two different things at once, and
                    a reader taking the red line off the axis read sixty
                    non-conformances where the register holds two. No footnote
                    fixes that; the axis has to mean one thing. */}
                <div className="card">
                  <div className="card-h">
                    <h3>First Time Right</h3>
                    <span className="muted" style={{ fontSize: 11 }}>
                      passed outright, to date
                    </span>
                  </div>
                  <div className="card-b">
                    {/* The axis covers the months the INSPECTION REGISTER
                        covers. Running it across a year the register says
                        nothing about leaves the reader to decide whether the
                        empty months are good ones. */}
                    <LineChart
                      labels={inspected.map((m) => m.month)}
                      yMax={100}
                      yLabel="Per cent passed"
                      xLabel={MONTH_AXIS}
                      series={[
                        { name: 'First time right', color: CATEGORY_COLOURS[0],
                          pts: inspected.map((m) => m.firstTimeRight) },
                      ]}
                    />
                    <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 10 }}>
                      {`Inspections passed outright over inspections carried out, accumulated from `}
                      {`the ${qualityInspections.length} rows on the register and counted from the `}
                      date on each — so every point is reproducible from the log beside it and the
                      last one is the register&rsquo;s own figure. The axis covers the months the
                      register covers.
                    </p>
                  </div>
                </div>

                <div className="card">
                  <div className="card-h">
                    <h3>Non-Conformances Raised</h3>
                    <span className="muted" style={{ fontSize: 11 }}>{`${nc.length} on the register`}</span>
                  </div>
                  <div className="card-b">
                    {/* Only the months the register covers. A month with no
                        row is not a month with no non-conformances — it is a
                        month nobody recorded — so it is left off rather than
                        drawn as a zero. */}
                    <BarChart
                      integer
                      yLabel="Raised in month"
                      xLabel={MONTH_AXIS}
                      groups={raisedIn.map((m) => ({
                        label: m.month,
                        bars: [{ v: m.ncrsRaised, color: '#D24141' }],
                      }))}
                    />
                    <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 10 }}>
                      {`Counted from the date on each non-conformance, so the months shown are the `}
                      {`months the register covers and they sum to its ${nc.length} rows. A month `}
                      with nothing recorded in it is left off rather than drawn as a zero.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Filters fields={[
              { label: 'Status', opts: options(nc, (n) => n.status) },
              { label: 'Discipline', opts: options(nc, (n) => n.discipline) },
              { label: 'Severity', opts: options(nc, (n) => n.severity) },
            ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((n) => (
                    <tr key={rowKey(n.no, n)}
                      className={`click${sel && rowKey(sel.no, sel) === rowKey(n.no, n) ? ' sel' : ''}`}
                      onClick={() => setSel(n)}>
                      {rolledUp && <td><span className="tid">{n.project}</span></td>}
                      <td><span className="tid">{n.no}</span></td>
                      <td>{n.title}</td>
                      <td>{n.discipline}</td>
                      <td>{n.type}</td>
                      <td><Badge status={n.severity} /></td>
                      <td>{n.raised}</td>
                      <td><span style={n.status === 'Overdue' ? { color: 'var(--red)', fontWeight: 600 } : {}}>{n.due}</span></td>
                      <td><Badge status={n.status} /></td>
                      <td>{n.resp}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      {nc.length === 0 ? (rolledUp ? 'No non-conformances are recorded in this scope.' : 'No non-conformances are recorded for this development.') : 'No NCRs match the current filters.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {sel && (
          <Drawer
            title={sel.no}
            status={sel.status}
            tabs={['Details', 'History']}
            onClose={() => setSel(null)}
          >
            {(tab) =>
              tab === 'History' ? (
                <AuditTimeline events={audit} />
              ) : (
                <div>
                  {kvGrid([
                    ['Title', sel.title], ['Discipline', sel.discipline], ['Type', sel.type],
                    ['Severity', sel.severity], ['Raised On', sel.raised], ['Due Date', sel.due],
                    ['Responsible', sel.resp], ['Location', sel.loc],
                  ])}
                  <div style={{ marginBottom: 16 }}>
                    <div className="kv-l">Description</div>
                    <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>{sel.desc}</p>
                  </div>
                  {docList(sel.docs)}
                </div>
              )}
          </Drawer>
        )}
      </div>
      )}
    </div>
  );
}
