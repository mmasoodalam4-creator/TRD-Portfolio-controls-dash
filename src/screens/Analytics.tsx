import { fmt, pct, idx, varianceTone } from '@/domain/format';
import { forecast, forecastScope, monthlyCost, FORECAST_TOLERANCE } from '@/domain/forecast';
import { useScope } from '@/state/ScopeProvider';
import { useCorporate } from '@/state/DataProvider';
import { KPI, Badge, LineChart, HBars, EV_SERIES } from '@/components';
import { MONTH_AXIS } from '@/domain/calendar';

const COLUMNS = ['Method', 'Formula', 'AFC (SAR)', 'Variance vs Budget', 'Confidence'];

/** A signed cost variance: red in brackets when unfavourable, green when favourable. */
function Variance({ v }: { v: number }) {
  const t = varianceTone(v);
  const colour = t === 'grey' ? 'var(--muted)' : `var(--${t})`;
  return (
    <span style={{ color: colour, fontWeight: 600 }}>
      {v < 0 ? `(${fmt(Math.abs(v))})` : fmt(v)}
    </span>
  );
}

/**
 * Earned value, performance indices and cost forecasting.
 *
 * The forecast table runs the three independent AFC methods from
 * domain/forecast over the same inputs, summed across the projects in scope.
 * All three are cost forecasts — what the development will finally cost the
 * owner — and their variance is measured against Approved Budget.
 *
 * Nothing on this screen is a stated figure: every number is derived from the
 * projects in scope, and a panel that could not be fed from them was removed
 * rather than shown with a placeholder.
 */
export function Analytics() {
  const { list, totals: a } = useScope();
  const { months, scurve } = useCorporate();

  // One implementation of the scope forecast, shared with the Cost module —
  // the two used to disagree by 44M at Corporate because this screen summed
  // per-development forecasts while Cost forecast the summed position.
  const perProject = list.map(forecast);
  const scopeForecast = forecastScope(list);
  const methodTotals = scopeForecast.methods;

  const composite = scopeForecast.composite;
  const adopted = scopeForecast.adopted;
  const divergence = scopeForecast.divergence;
  const withinTolerance = scopeForecast.onTarget;
  const onTarget = perProject.filter((f) => f.onTarget).length;

  // The earned-value curve for the projects in scope: each project's own
  // curve, summed month by month, so it agrees with the indices above it.
  const curves = list.map((p) => monthlyCost(p, months, scurve));
  const sumAt = (i: number, pick: (r: ReturnType<typeof monthlyCost>[number]) => number | null): number | null => {
    const vals = curves.map((c) => (c[i] ? pick(c[i]) : null));
    return vals.some((v) => v === null) ? null : vals.reduce<number>((t, v) => t + (v ?? 0), 0);
  };
  const curve = months.map((_, i) => ({
    pv: sumAt(i, (r) => r.plannedCum) ?? 0,
    ev: sumAt(i, (r) => r.earnedCum),
    ac: sumAt(i, (r) => r.actualCum),
  }));

  return (
    <div className="fade-up">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <KPI icon="trendUp" label="Portfolio SPI" value={idx(a.spi)} sub="EV ÷ PV, all in scope" tone={a.spi >= 1 ? 'green' : 'red'} />
        <KPI icon="coins" label="Portfolio CPI" value={idx(a.cpi)} sub="EV ÷ AC, all in scope" tone={a.cpi >= 1 ? 'green' : 'red'} />
        <KPI icon="variance" label="Forecast Divergence" value={pct(divergence, adopted, 1)}
          sub={`Composite forecast vs adopted AFC · ±${(FORECAST_TOLERANCE * 100).toFixed(0)}% tolerance`}
          tone={withinTolerance ? 'green' : 'amber'} />
        <KPI icon="target" label="Forecasts On Target" value={`${onTarget} / ${a.count}`}
          sub="Projects whose forecast lands within tolerance of the adopted AFC"
          tone={onTarget === a.count ? 'green' : 'amber'} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div className="card">
          <div className="card-h"><h3>Earned Value Analysis</h3></div>
          <div className="card-b">
            <LineChart money labels={months} xLabel={MONTH_AXIS} series={EV_SERIES(
              curve.map((s) => s.pv), curve.map((s) => s.ev), curve.map((s) => s.ac),
            )} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Performance Indices</h3></div>
          <div className="card-b">
            <HBars max={1.2} fmtV={(v) => idx(v)} items={[
              { label: 'SPI', v: a.spi, color: a.spi >= 1 ? '#1E9E5A' : '#D24141' },
              { label: 'CPI', v: a.cpi, color: a.cpi >= 1 ? '#1E9E5A' : '#D24141' },
            ]} />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
              Both indices are derived from the earned value, planned value and actual cost of the
              projects in scope. An index of 1.00 is on plan; below it is behind schedule or over cost.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>Anticipated Final Cost — forecast methods</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {`${a.count} project${a.count === 1 ? '' : 's'} in scope · figures in SAR`}
          </span>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {methodTotals.map((m) => (
                  <tr key={m.key}>
                    <td>
                      <b style={{ textTransform: 'capitalize' }}>{m.key.replace('-', ' ')}</b>
                      <div className="muted" style={{ fontSize: 11 }}>{m.basis}</div>
                    </td>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{m.formula}</td>
                    <td>{fmt(m.afc)}</td>
                    <td><Variance v={a.budget - m.afc} /></td>
                    <td><Badge status={m.confidence} /></td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td><b>Weighted composite</b></td>
                  <td className="muted">Blended across the methods above</td>
                  <td>{fmt(composite)}</td>
                  <td><Variance v={a.budget - composite} /></td>
                  <td />
                </tr>
                <tr className="tbl-total">
                  <td><b>Adopted AFC</b></td>
                  <td className="muted">Management control position</td>
                  <td>{fmt(adopted)}</td>
                  <td><Variance v={a.budget - adopted} /></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
            {withinTolerance
              ? `Forecast is in line with the adopted control position across the projects in scope — `
                + `${fmt(Math.abs(divergence))} SAR ${divergence >= 0 ? 'above' : 'below'} it, inside the `
                + `${(FORECAST_TOLERANCE * 100).toFixed(0)}% tolerance.`
              : `Forecast is ${fmt(Math.abs(divergence))} SAR ${divergence > 0 ? 'above' : 'below'} the adopted `
                + `control position across the projects in scope. Open Cost & Financials → Forecast (AFC) on a `
                + `project for the cost performance its remaining work would have to achieve.`}
          </div>
        </div>
      </div>
    </div>
  );
}
