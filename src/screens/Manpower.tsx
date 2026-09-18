import { fmt, idx, mn, pct } from '@/domain/format';
import { KPI, Badge, HBars, Donut, Prog, LineChart } from '@/components';
import { CATEGORY_COLOURS, sumBy } from '@/components/charts/breakdown';
import { useScope, useScopedRegisters, useScopedHistory } from '@/state/ScopeProvider';
import { ScopeBand, bandMetrics } from './shared';
import { SubTabs, useSubTab } from './subtabs';
import { MONTH_AXIS } from '@/domain/calendar';

const COLUMNS = ['#', 'Trade / Discipline', 'Resource Type', 'Direct', 'Indirect', 'Labour', 'Total',
  'Manhours', 'Productivity Index', 'Variance %', 'Status'];

/**
 * Workforce availability and productivity.
 *
 * Headcount, manhours and a productivity index only. Labour rates and labour
 * cost are deliberately absent — those sit with the contractor, not the owner's
 * control system. Everything on the screen is read from the manpower register:
 * the trend charts it used to carry were fixed arrays that never changed with
 * the development selected.
 */
export function Manpower() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';

  // Every register this module shows describes a POSITION rather than an
  // event — a trade, a week, a counterparty — so the roll-up folds them onto
  // their own key and sums them. There is no development column because no row
  // belongs to one development. See `domain/rollup.ts`.
  const { manpower: mp, attendance, workforce, resourcePlan } = useScopedRegisters();
  const history = useScopedHistory();
  const [view, setView] = useSubTab(
    ['By Trade', 'Resource Plan', 'Attendance & Hours', 'By Counterparty'] as const);

  const tot = mp.reduce(
    (a, m) => ({
      direct: a.direct + m.direct, indirect: a.indirect + m.indirect, labor: a.labor + m.labor,
      total: a.total + m.total, hours: a.hours + m.hours, weighted: a.weighted + m.prod * m.hours,
    }),
    { direct: 0, indirect: 0, labor: 0, total: 0, hours: 0, weighted: 0 },
  );
  // The register's productivity index, weighted by the hours each trade worked.
  const productivity = tot.hours ? tot.weighted / tot.hours : NaN;
  const atRisk = mp.filter((m) => m.status !== 'On Track').length;
  // Hours rather than headcount: a trade of six people working double shifts
  // is a bigger share of the exposure than a trade of twelve who are not.
  const byTrade = sumBy(mp, (m) => m.trade, (m) => m.hours);

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Committed (SAR)', fmt(pos.committed)],
        ['Actual Cost (SAR)', fmt(pos.actual)],
        ['Workforce', String(tot.total)],
        ['Productivity Index', idx(productivity), productivity >= 1 ? 'var(--green)' : 'var(--amber)'],
      ])} />

      <SubTabs
        tabs={['By Trade', 'Resource Plan', 'Attendance & Hours', 'By Counterparty'] as const}
        active={view}
        onSelect={setView}
        counts={{
          'By Trade': mp.length,
          'Resource Plan': resourcePlan.length,
          'By Counterparty': workforce.length,
        }}
      />

      {view === 'Resource Plan' ? (
        <div className="card">
          <div className="card-h">
            <h3>Resource Plan</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>
              plan against actual, then the three months ahead
            </span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{['Trade / discipline', 'Planned', 'Actual', 'Variance', '+1 month',
                    '+2 months', '+3 months', 'Direction'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {resourcePlan.map((r) => {
                    const v = r.actual - r.planned;
                    return (
                      <tr key={r.trade}>
                        <td><b>{r.trade}</b></td>
                        <td>{r.planned}</td>
                        <td><b style={{ color: 'var(--blue)' }}>{r.actual}</b></td>
                        <td style={{ color: v < 0 ? 'var(--red)' : 'var(--green)' }}>
                          {v > 0 ? `+${v}` : v}
                        </td>
                        {r.forecast.map((f, i) => <td key={i}>{f}</td>)}
                        <td><Badge status={r.direction === 'Ramping up' ? 'In Progress'
                          : r.direction === 'Demobilising' ? 'Under Review' : 'On Track'}
                        label={r.direction} /></td>
                      </tr>
                    );
                  })}
                  {resourcePlan.length === 0 && (
                    <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      {rolledUp ? 'No workforce is recorded in this scope.' : 'No workforce is recorded on this development.'}
                    </td></tr>
                  )}
                </tbody>
                {resourcePlan.length > 0 && (
                  <tfoot>
                    <tr className="tbl-total">
                      <td>Total</td>
                      <td>{resourcePlan.reduce((a, r) => a + r.planned, 0)}</td>
                      <td>{resourcePlan.reduce((a, r) => a + r.actual, 0)}</td>
                      <td>
                        {resourcePlan.reduce((a, r) => a + r.actual - r.planned, 0)}
                      </td>
                      {[0, 1, 2].map((i) => (
                        <td key={i}>{resourcePlan.reduce((a, r) => a + r.forecast[i], 0)}</td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              The plan is what the workforce is measured against — without it, a headcount is a
              number with nothing to fail. The three forward columns are a forecast: they carry no
              approval and move nothing on the dashboard.
            </p>
          </div>
        </div>
      ) : view === 'Attendance & Hours' ? (
        <div className="card">
          <div className="card-h">
            <h3>Attendance and Hours</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>
              the weeks inside the reporting month
            </span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{['Week', 'Planned hours', 'Worked', 'Productive', 'Overtime',
                    'Attendance'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {attendance.map((w) => (
                    <tr key={w.week}>
                      <td><b>{w.week}</b></td>
                      <td>{fmt(w.planned)}</td>
                      <td><b>{fmt(w.worked)}</b></td>
                      <td>{fmt(w.productive)}</td>
                      <td>{fmt(w.overtime)}</td>
                      <td style={{ width: 160 }}>
                        <Prog v={w.planned ? Math.round((w.worked / w.planned) * 100) : 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="tbl-total">
                    <td>Total</td>
                    <td>{fmt(attendance.reduce((a, w) => a + w.planned, 0))}</td>
                    <td>{fmt(attendance.reduce((a, w) => a + w.worked, 0))}</td>
                    <td>{fmt(attendance.reduce((a, w) => a + w.productive, 0))}</td>
                    <td>{fmt(attendance.reduce((a, w) => a + w.overtime, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              {`The weeks sum to ${fmt(tot.hours)} manhours — the figure the period reports and the `}
              divisor under every productivity number on this screen. They are that figure split
              across the month rather than a second count of it, so the two cannot disagree.
              Monthly stays the reporting cadence; the weeks are how the workforce is counted.
            </p>
          </div>
        </div>
      ) : view === 'By Counterparty' ? (
        <div className="card">
          <div className="card-h">
            <h3>Workforce by Counterparty</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>who is actually supplying the people</span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{['Counterparty', 'Scope supplied', 'Headcount', 'Manhours',
                    'Share of workforce', 'Status'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {workforce.map((w) => (
                    <tr key={w.contractor}>
                      <td><b>{w.contractor}</b></td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{w.scope}</td>
                      <td><b style={{ color: 'var(--blue)' }}>{w.headcount}</b></td>
                      <td>{fmt(w.hours)}</td>
                      <td style={{ width: 170 }}>
                        <Prog v={tot.total ? Math.round((w.headcount / tot.total) * 100) : 0} />
                      </td>
                      <td><Badge status={w.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="tbl-total">
                    <td colSpan={2}>Total</td>
                    <td>{workforce.reduce((a, w) => a + w.headcount, 0)}</td>
                    <td>{fmt(workforce.reduce((a, w) => a + w.hours, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              Every trade is attributed to the package that bought it, so headcount and hours tie
              to the register exactly. Attribution is the point: a shortfall that belongs to nobody
              is a complaint, and one against a named counterparty is evidence.
            </p>
          </div>
        </div>
      ) : (
      <div className="card">
        <div className="card-b">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 16 }}>
            <KPI icon="manpower" label="Total Manpower" value={tot.total} sub={`${mp.length} trades on site`} tone="blue" />
            <KPI icon="manpower" label="Direct Manpower" value={tot.direct} sub={`${pct(tot.direct, tot.total)} of total`} tone="green" />
            <KPI icon="manpower" label="Indirect Manpower" value={tot.indirect} sub={`${pct(tot.indirect, tot.total)} of total`} tone="amber" />
            <KPI icon="manpower" label="Labour Manpower" value={tot.labor} sub={`${pct(tot.labor, tot.total)} of total`} tone="navy" />
            <KPI icon="activity" label="Manhours (Period)" value={fmt(tot.hours)} sub="Exposure hours for HSE" tone="green" />
          </div>

          {mp.length > 0 && (
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, marginBottom: 16 }}
            >
              <div className="card">
                <div className="card-h">
                  <h3>Workforce Composition</h3>
                  <span className="muted" style={{ fontSize: 11 }}>{`${tot.total} on site`}</span>
                </div>
                <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Donut
                    data={[
                      { name: 'Direct', v: tot.direct, c: CATEGORY_COLOURS[0] },
                      { name: 'Indirect', v: tot.indirect, c: CATEGORY_COLOURS[1] },
                      { name: 'Labour', v: tot.labor, c: CATEGORY_COLOURS[2] },
                    ].filter((d) => d.v > 0)}
                    total={String(tot.total)}
                    label="people"
                    size={140}
                  />
                </div>
              </div>
              <div className="card">
                <div className="card-h">
                  <h3>Manhours by Trade</h3>
                  <span className="muted" style={{ fontSize: 11 }}>{`${fmt(tot.hours)} this period`}</span>
                </div>
                <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Donut data={byTrade} total={mn(tot.hours)} label="manhours" size={140} />
                </div>
              </div>
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-h"><h3>Workforce Trend</h3></div>
              <div className="card-b">
                <LineChart
                  labels={history.map((m) => m.month)}
                  integer
                  yLabel="People on site"
                  xLabel={MONTH_AXIS}
                  series={[
                    { name: 'Total workforce', color: '#2F6DD0', pts: history.map((m) => m.workforce) },
                    { name: 'Direct', color: '#1E9E5A', pts: history.map((m) => m.direct) },
                    { name: 'Indirect', color: '#6D4AC4', pts: history.map((m) => m.indirect) },
                    { name: 'Labour', color: '#eb6834', pts: history.map((m) => m.labour) },
                  ]}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <h3>Productivity Trend</h3>
                <span className="muted" style={{ fontSize: 11 }}>earned value per manhour</span>
              </div>
              <div className="card-b">
                {/* One series, so no key: the card heading names it. What the
                    axis needed was its UNIT — a scale running to 4,399 says
                    nothing on its own. */}
                <LineChart
                  labels={history.map((m) => m.month)}
                  yLabel="SAR / manhour"
                  xLabel={MONTH_AXIS}
                  series={[{ name: 'SAR / manhour', color: '#1E9E5A', pts: history.map((m) => m.productivity) }]}
                />
                <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 10 }}>
                  The last point is the reported position. The months before it are modelled from
                  {rolledUp ? ' the progress curves of the developments in scope.' : " this development\u2019s own progress curve."}
                </p>
              </div>
            </div>
          </div>

          <div className="tbl-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {mp.map((m, i) => (
                  <tr key={m.trade}>
                    <td>{i + 1}</td>
                    <td><b>{m.trade}</b></td>
                    <td><span className="pill b-blue">{m.type}</span></td>
                    <td>{m.direct || '–'}</td>
                    <td>{m.indirect || '–'}</td>
                    <td>{m.labor || '–'}</td>
                    <td><b style={{ color: 'var(--blue)' }}>{m.total}</b></td>
                    <td>{fmt(m.hours)}</td>
                    <td>{idx(m.prod)}</td>
                    <td><span style={{ color: m.varpct.startsWith('-') ? 'var(--red)' : 'var(--green)' }}>{m.varpct}</span></td>
                    <td><Badge status={m.status} /></td>
                  </tr>
                ))}
                {mp.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                    {rolledUp ? 'No workforce is recorded in this scope.' : 'No workforce is recorded for this development.'}
                  </td></tr>
                )}
                {mp.length > 0 && (
                  <tr className="tbl-total">
                    <td />
                    <td>Total</td>
                    <td />
                    <td>{tot.direct}</td>
                    <td>{tot.indirect}</td>
                    <td>{tot.labor}</td>
                    <td>{tot.total}</td>
                    <td>{fmt(tot.hours)}</td>
                    <td>{idx(productivity)}</td>
                    <td />
                    <td><Badge status={atRisk ? 'At Risk' : 'On Track'} /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {mp.length > 0 && (
            <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
              <div className="card">
                <div className="card-h"><h3>Headcount by Trade</h3></div>
                <div className="card-b">
                  <HBars items={mp.map((m) => ({ label: m.trade, v: m.total, color: '#2F6DD0' }))} />
                </div>
              </div>
              <div className="card">
                <div className="card-h"><h3>Manhours by Trade</h3></div>
                <div className="card-b">
                  <HBars items={mp.map((m) => ({ label: m.trade, v: m.hours, color: '#1E9E5A' }))} fmtV={fmt} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
