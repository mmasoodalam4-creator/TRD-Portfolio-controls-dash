import { fmt, mn, idx, varianceTone } from '@/domain/format';
import { forecastScope, FORECAST_TOLERANCE } from '@/domain/forecast';
import { useScope } from '@/state/ScopeProvider';
import { Badge, HBars } from '@/components';
import type { ScopePosition } from '@/domain/position';

const COLUMNS = ['Method', 'Formula', 'Basis', 'AFC (SAR)', 'Variance vs Budget', 'Confidence'];

/** Readable method names for the table and the chart. */
const NAME: Record<string, string> = {
  optimistic: 'Optimistic', 'cost-based': 'Cost-based', pessimistic: 'Pessimistic',
};

const tone = (v: number): string =>
  (varianceTone(v) === 'green' ? 'var(--green)' : varianceTone(v) === 'red' ? 'var(--red)' : 'var(--muted)');

/**
 * Anticipated Final Cost, forecast three ways plus a weighted composite.
 *
 * The methods run on the project's own EV, AC, PV and budget rather than being
 * tuned to agree with the AFC management has adopted. The gap between the two
 * is the point of the screen: it is what tells an owner whether the position
 * being reported is still reachable, and the TCPI beneath it says what cost
 * performance the remaining work would have to achieve to get there.
 *
 * Three methods, not five: two of the original five were the cost-based
 * formula written differently, and a panel that shows one number three times
 * under three confidence labels is not a comparison.
 */
export function ForecastTab({ p }: { p: ScopePosition }) {
  // Forecast each development on its own figures and sum — never forecast the
  // summed position. BAC ÷ CPI is not linear, so the two differ (44M across
  // the shipped portfolio at Corporate), and Analytics already sums per
  // development: two screens, one Composite Forecast.
  const { list } = useScope();
  const f = forecastScope(list.length ? list : [p]);
  const reachable = f.onTarget;
  const above = f.divergence > 0;
  // Compared at the two places the screen prints, so "requires 1.16 vs 1.16
  // achieved" cannot be shown in red.
  const tcpiOk = Number.isFinite(f.tcpiToAdopted) && Number(f.tcpiToAdopted.toFixed(2)) <= Number(f.cpi.toFixed(2));

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 16 }}>
        {([
          ['Adopted AFC (control position)', mn(f.adopted), 'As recorded against the development', 'var(--ink)'],
          ['Composite Forecast', mn(f.composite), 'Weighted across the three methods', 'var(--ink)'],
          ['Forecast vs Adopted', mn(f.divergence),
            reachable ? `Within ${Math.round(FORECAST_TOLERANCE * 100)}% of the adopted AFC`
              : above ? 'Forecast above the adopted AFC' : 'Forecast below the adopted AFC',
            reachable ? 'var(--green)' : 'var(--red)'],
          ['TCPI to Adopted AFC', idx(f.tcpiToAdopted),
            Number.isFinite(f.tcpiToAdopted)
              ? (tcpiOk ? `Achievable at the CPI of ${idx(f.cpi)} achieved` : `Requires CPI ${idx(f.tcpiToAdopted)} vs ${idx(f.cpi)} achieved`)
              : 'No cost remaining against the adopted AFC',
            tcpiOk ? 'var(--green)' : 'var(--red)'],
        ] as const).map((k, i) => (
          <div key={i} className="card">
            <div className="card-b">
              <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{k[0]}</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: k[3] }}>{k[1]}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{k[2]}</div>
            </div>
          </div>
        ))}
      </div>

      {!reachable && (
        <div className="card" style={{ marginBottom: 16, background: 'var(--amber-bg)', borderColor: '#f0d9ae' }}>
          <div className="card-b">
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              {above ? 'Forecast exceeds the adopted control position' : 'Forecast is well below the adopted control position'}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6, color: '#7a5a1f' }}>
              {above
                ? `Performance to date (CPI ${idx(f.cpi)}, SPI ${idx(f.spi)}) forecasts an Anticipated `
                  + `Final Cost of ${fmt(f.composite)} SAR against an adopted ${fmt(f.adopted)} SAR. Holding the `
                  + `adopted position requires the remaining ${fmt(f.bac - f.ev)} SAR of work to be delivered at a `
                  + `cost performance index of ${idx(f.tcpiToAdopted)}, against ${idx(f.cpi)} achieved `
                  + 'so far. Either a recovery plan or a revised AFC is required.'
                : `Performance to date forecasts ${fmt(f.composite)} SAR against an adopted ${fmt(f.adopted)} SAR — `
                  + `more than ${Math.round(FORECAST_TOLERANCE * 100)}% under. The adopted AFC may be carrying `
                  + 'contingency that should be reviewed, or the position may be understating cost to come.'}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h3>Forecast Methods</h3></div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {f.methods.map((m) => (
                  <tr key={m.key}>
                    <td><b>{NAME[m.key] ?? m.key}</b></td>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{m.formula}</td>
                    <td className="muted">{m.basis}</td>
                    <td>{fmt(m.afc)}</td>
                    <td><span style={{ color: tone(m.variance), fontWeight: 600 }}>{mn(m.variance)}</span></td>
                    <td><Badge status={m.confidence} /></td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td><b>Weighted composite</b></td>
                  <td colSpan={2} className="muted">Blended 20 / 50 / 30 across the methods above</td>
                  <td>{fmt(f.composite)}</td>
                  <td><span style={{ color: tone(f.bac - f.composite), fontWeight: 600 }}>{mn(f.bac - f.composite)}</span></td>
                  <td />
                </tr>
                <tr className="tbl-total">
                  <td><b>Adopted AFC</b></td>
                  <td colSpan={2} className="muted">Management control position</td>
                  <td>{fmt(f.adopted)}</td>
                  <td><span style={{ color: tone(f.bac - f.adopted), fontWeight: 600 }}>{mn(f.bac - f.adopted)}</span></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="card">
          <div className="card-h"><h3>Forecast Range (SAR)</h3></div>
          <div className="card-b">
            <HBars
              max={Math.max(f.bac, f.adopted, ...f.methods.map((m) => m.afc)) * 1.05}
              fmtV={(v) => mn(v)}
              items={[
                { label: 'Budget', v: f.bac, color: '#0B2545' },
                ...f.methods.map((m) => ({
                  label: NAME[m.key] ?? m.key,
                  v: m.afc,
                  color: m.afc <= f.bac ? '#1E9E5A' : '#D24141',
                })),
                { label: 'Adopted', v: f.adopted, color: '#C9A227' },
              ]}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Performance Basis</h3></div>
          <div className="card-b">
            <div className="kv">
              {([
                ['Approved Development Budget (BAC)', fmt(f.bac)],
                ['Earned Value (EV)', fmt(f.ev)],
                ['Actual Cost (AC)', fmt(f.ac)],
                ['Planned Value (PV)', fmt(f.pv)],
                ['Cost Performance Index (CPI)', idx(f.cpi)],
                ['Schedule Performance Index (SPI)', idx(f.spi)],
                ['Remaining work (BAC − EV)', fmt(f.bac - f.ev)],
                ['Estimate to complete (composite − AC)', fmt(f.composite - f.ac)],
                ['TCPI to Approved Budget', idx(f.tcpiToBudget)],
              ] as const).map(([l, v], i) => (
                <div key={i}>
                  <div className="kv-l">{l}</div>
                  <div className="kv-v">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
