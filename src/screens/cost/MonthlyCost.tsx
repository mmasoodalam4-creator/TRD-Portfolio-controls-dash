import { fmt, idx } from '@/domain/format';
import { monthlyCost, DATA_DATE_INDEX } from '@/domain/forecast';
import { LineChart, BarChart, EV_SERIES } from '@/components';
import type { ScopePosition } from '@/domain/position';
import { MONTH_AXIS } from '@/domain/calendar';

const COLUMNS = ['Period', 'Planned (PV)', 'Earned (EV)', 'Actual (AC)',
  'Cum. Planned', 'Cum. Earned', 'Cum. Actual', 'Cum. CPI', 'Cum. SPI'];

/**
 * The month-by-month cost position.
 *
 * Cumulative PV, EV and AC reach the project's own figures at the data date,
 * and planned value reaches the Approved Development Budget at completion, so
 * this table cannot disagree with the KPI row on the summary tab.
 */
export function MonthlyCostTab({ p, months, scurve }: {
  p: ScopePosition;
  months: string[];
  scurve: Parameters<typeof monthlyCost>[2];
}) {
  const rows = monthlyCost(p, months, scurve);
  const actualRows = rows.filter((r) => r.actualCum !== null);

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-h"><h3>Cumulative Cost Position</h3></div>
          <div className="card-b">
            <LineChart money labels={months} xLabel={MONTH_AXIS} series={EV_SERIES(
              rows.map((r) => r.plannedCum), rows.map((r) => r.earnedCum), rows.map((r) => r.actualCum),
            )} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>In-Month Movement</h3></div>
          <div className="card-b">
            <BarChart
              money
              series={['Actual Cost (AC)', 'Earned Value (EV)']}
              xLabel={MONTH_AXIS}
              groups={actualRows.map((r) => ({
                label: r.month,
                // NOT clamped to zero — see CostSummary. A negative movement
                // hangs below the zero line at the same scale.
                bars: [
                  { v: Number.isFinite(r.actualMonth ?? 0) ? (r.actualMonth ?? 0) : 0, color: '#D24141' },
                  { v: Number.isFinite(r.earnedMonth ?? 0) ? (r.earnedMonth ?? 0) : 0, color: '#1E9E5A' },
                ],
              }))}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Monthly Cost Register</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {`Data date: ${months[DATA_DATE_INDEX]} · figures in SAR`}
          </span>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const cpi = r.earnedCum !== null && r.actualCum ? r.earnedCum / r.actualCum : null;
                  const spi = r.earnedCum !== null && r.plannedCum ? r.earnedCum / r.plannedCum : null;
                  const forecastPeriod = r.actualCum === null;
                  return (
                    <tr key={i} className={i === DATA_DATE_INDEX ? 'sel' : ''}>
                      <td>
                        <b>{r.month}</b>
                        {forecastPeriod && <span className="pill b-grey" style={{ marginLeft: 8 }}>Planned</span>}
                      </td>
                      <td>{fmt(r.plannedMonth)}</td>
                      <td>{r.earnedMonth === null ? '–' : fmt(r.earnedMonth)}</td>
                      <td>{r.actualMonth === null ? '–' : fmt(r.actualMonth)}</td>
                      <td>{fmt(r.plannedCum)}</td>
                      <td>{r.earnedCum === null ? '–' : fmt(r.earnedCum)}</td>
                      <td>{r.actualCum === null ? '–' : fmt(r.actualCum)}</td>
                      <td>
                        {cpi === null ? '–' : (
                          <b style={{ color: cpi >= 0.95 ? 'var(--green)' : 'var(--amber)' }}>{idx(cpi)}</b>
                        )}
                      </td>
                      <td>
                        {spi === null ? '–' : (
                          <b style={{ color: spi >= 0.95 ? 'var(--green)' : 'var(--amber)' }}>{idx(spi)}</b>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="tbl-total">
                  <td>At completion</td>
                  <td colSpan={3} className="muted">Planned to complete = Approved Development Budget</td>
                  <td>{fmt(rows[rows.length - 1]?.plannedCum ?? 0)}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
