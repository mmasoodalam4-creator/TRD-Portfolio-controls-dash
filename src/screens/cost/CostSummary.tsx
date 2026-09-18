import type { CostCategory } from '@/domain/types';
import { fmt, mn, pct, idx, varianceWord } from '@/domain/format';
import { forecastScope, monthlyCost } from '@/domain/forecast';
import { useScope } from '@/state/ScopeProvider';
import { KPI, Badge, LineChart, BarChart, EV_SERIES } from '@/components';
import { toneColor, toneOfKpi } from './tabs';
import type { ScopePosition } from '@/domain/position';
import { MONTH_AXIS } from '@/domain/calendar';

const COLUMNS = ['#', 'Cost Category', 'Approved Budget', 'Committed', 'Actual (AC)', 'Earned (EV)',
  'AFC', 'Variance', 'Var %', 'Status'];

/** A signed figure for a table: mn's "−" convention, at full precision. */
const signed = (n: number): string => (n < 0 ? `−${fmt(-n)}` : fmt(n));

/** A method key ("cost-based") as a label ("Cost-based"). */
const methodLabel = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

/**
 * The landing tab: the project's cost position at a glance.
 *
 * Every figure is an owner-side cost — Approved Development Budget, Committed
 * Cost, Actual Cost, Earned Value, Anticipated Final Cost, and Budget Variance
 * as Approved Budget less AFC.
 */
export function CostSummary({ p, cats, months, scurve, onSelect }: {
  p: ScopePosition;
  cats: CostCategory[];
  months: string[];
  scurve: Parameters<typeof monthlyCost>[2];
  onSelect: (c: CostCategory) => void;
}) {
  const tot = cats.reduce(
    (a, c) => ({
      budget: a.budget + c.budget, committed: a.committed + c.committed,
      actual: a.actual + c.actual, ev: a.ev + c.ev, afc: a.afc + c.afc, varc: a.varc + c.varc,
    }),
    { budget: 0, committed: 0, actual: 0, ev: 0, afc: 0, varc: 0 },
  );
  const budgetVariance = p.budget - p.afc;

  // Per development, summed — the same figure the Forecast tab and Analytics
  // show, computed the same way. See forecastScope.
  const { list } = useScope();
  const f = forecastScope(list.length ? list : [p]);
  const rows = monthlyCost(p, months, scurve);

  // TCPI is NaN once the target is already spent; a dash, never "Above CPI".
  const tcpiCell = (tcpi: number): [string, string, string] => (
    !Number.isFinite(tcpi) ? [idx(tcpi), 'Not applicable', 'var(--muted)']
      : tcpi <= f.cpi ? [idx(tcpi), 'Achievable', 'var(--green)']
        : [idx(tcpi), 'Above achieved CPI', 'var(--amber)']
  );

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6,minmax(0,1fr))', marginBottom: 16 }}>
        <KPI icon="wallet" label="Committed Cost (SAR)" value={mn(p.committed)} sub={`${pct(p.committed, p.budget)} of Budget`} tone="blue" />
        <KPI icon="coins" label="Actual Cost (AC) (SAR)" value={mn(p.actual)} sub={`${pct(p.actual, p.budget)} of Budget`} tone="amber" />
        <KPI icon="afc" label="Earned Value (EV) (SAR)" value={mn(p.ev)} sub={`${pct(p.ev, p.budget)} of Budget`} tone="green" />
        <KPI icon="variance" label="AFC (SAR)" value={mn(p.afc)} sub={`${pct(p.afc, p.budget)} of Budget`} tone="navy" />
        <KPI icon="trendUp" label="Budget Variance (SAR)" value={mn(budgetVariance)}
          sub={varianceWord(budgetVariance)} tone={toneOfKpi(budgetVariance)} />
        <KPI icon="wallet" label="Payments Made (SAR)" value={mn(p.paid)} sub={`${pct(p.paid, p.budget)} of Budget`} tone="gold" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2.2fr) minmax(0,1fr)', gap: 16 }}>
        <div>
          <h3 style={{ marginBottom: 10, fontSize: 14.5 }}>Cost by Category</h3>
          <div className="tbl-wrap">
            <table>
              <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {cats.map((c, i) => (
                  <tr key={i} className="click" onClick={() => onSelect(c)}>
                    <td>{i + 1}</td>
                    <td><b>{c.cat}</b></td>
                    <td>{fmt(c.budget)}</td>
                    <td>{c.committed ? fmt(c.committed) : '-'}</td>
                    <td>{c.actual ? fmt(c.actual) : '-'}</td>
                    <td>{fmt(c.ev)}</td>
                    <td>{fmt(c.afc)}</td>
                    <td><span style={{ color: toneColor(c.varc), fontWeight: 600 }}>{signed(c.varc)}</span></td>
                    <td style={{ color: toneColor(c.varc) }}>{`${c.varpct}%`}</td>
                    <td><Badge status={c.status} /></td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td />
                  <td>TOTAL</td>
                  <td>{fmt(tot.budget)}</td>
                  <td>{fmt(tot.committed)}</td>
                  <td>{fmt(tot.actual)}</td>
                  <td>{fmt(tot.ev)}</td>
                  <td>{fmt(tot.afc)}</td>
                  <td><span style={{ color: toneColor(tot.varc) }}>{signed(tot.varc)}</span></td>
                  <td style={{ color: toneColor(tot.varc) }}>{pct(tot.varc, tot.budget, 1)}</td>
                  <td><Badge status={varianceWord(tot.varc)} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Cost Performance</h3></div>
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14, textAlign: 'center' }}>
              {([
                ['SPI', idx(f.spi), f.spi >= 0.95 ? 'On Track' : 'Behind Schedule', f.spi >= 0.95 ? 'var(--green)' : 'var(--amber)'],
                ['CPI', idx(f.cpi), f.cpi >= 0.95 ? 'On Track' : 'Below Target', f.cpi >= 0.95 ? 'var(--green)' : 'var(--red)'],
                ['TCPI to AFC', ...tcpiCell(f.tcpiToAdopted)],
                ['TCPI to Budget', ...tcpiCell(f.tcpiToBudget)],
              ] as const).map((g, i) => (
                <div key={i} style={{ padding: '12px 0' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{g[0]}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: g[3] }}>{g[1]}</div>
                  <div style={{ fontSize: 10.5, color: g[3] }}>{g[2]}</div>
                </div>
              ))}
            </div>

            {/*
              One line per method the forecast returns — however many there
              are. The panel used to assume five.
            */}
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
              <div className="kv-l" style={{ marginBottom: 6 }}>Forecast AFC by method (SAR)</div>
              {f.methods.map((m) => (
                <div key={m.key} className="between" style={{ fontSize: 12, padding: '3px 0' }}>
                  <span style={{ fontWeight: 600 }}>{methodLabel(m.key)}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ color: toneColor(m.variance), fontWeight: 600 }}>{mn(m.afc)}</span>
                    <Badge status={m.confidence} />
                  </span>
                </div>
              ))}
              <div className="between" style={{ fontSize: 12, padding: '5px 0 0', fontWeight: 700 }}>
                <span>Composite vs adopted {mn(f.adopted)}</span>
                <span style={{ color: f.onTarget ? 'var(--green)' : 'var(--amber)' }}>{mn(f.composite)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginTop: 16 }}>
        <div className="card">
          <div className="card-h"><h3>Cost Performance S-Curve</h3></div>
          <div className="card-b">
            <LineChart money labels={months} xLabel={MONTH_AXIS} series={EV_SERIES(
              rows.map((r) => r.plannedCum), rows.map((r) => r.earnedCum), rows.map((r) => r.actualCum),
            )} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Cost Trend (Monthly)</h3></div>
          <div className="card-b">
            <BarChart
              money
              series={['Actual Cost (AC)', 'Earned Value (EV)']}
              xLabel={MONTH_AXIS}
              groups={rows.filter((r) => r.actualMonth !== null).map((r) => ({
                label: r.month,
                // NOT clamped to zero. A month where cost came back is a
                // real event and it now draws below the zero line; clamping
                // made it indistinguishable from a month with no movement.
                bars: [
                  { v: r.actualMonth ?? 0, color: '#D24141' },
                  { v: r.earnedMonth ?? 0, color: '#1E9E5A' },
                ],
              }))}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Cash Flow &amp; Payments</h3></div>
          <div className="card-b">
            <div style={{ marginBottom: 16 }}>
              <div className="kv-l">Contractor Payments Made to Date</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(p.paid)}</div>
              <div className="prog" style={{ marginTop: 6 }}>
                <span style={{ width: pct(p.paid, p.budget, 1), background: 'var(--blue)' }} />
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                {`${pct(p.paid, p.budget, 1)} of Budget`}
              </div>
            </div>
            <div>
              <div className="kv-l">Certifications Submitted to Owner (IPC)</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(p.certified)}</div>
              <div className="prog" style={{ marginTop: 6 }}>
                <span style={{ width: pct(p.certified, p.budget, 1), background: 'var(--green)' }} />
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                {`${pct(p.certified, p.budget, 1)} of Budget`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
