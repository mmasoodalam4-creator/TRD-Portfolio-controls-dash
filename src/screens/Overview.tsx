import type { NavFn } from '@/app/types';
import type { KpiTone } from '@/components';
import { fmt, mn, idx, varianceTone } from '@/domain/format';
import { spiOf, cpiOf } from '@/domain/calc';
import { riskLevel } from '@/domain/risk';
import { monthlyCost } from '@/domain/forecast';
import { KPI, Badge, LineChart, EV_SERIES } from '@/components';
import { useScope } from '@/state/ScopeProvider';
import { useCorporate, useRegisters } from '@/state/DataProvider';
import { ProjBand, PickDevelopment } from './shared';
import { positionOfProject } from '@/domain/position';
import { MonthlyBreakdown } from './MonthlyBreakdown';
import { MONTH_AXIS } from '@/domain/calendar';

const DETAIL_LABELS = ['Portfolio', 'Delivery Route', 'PMC', 'Start Date', 'Planned Finish', 'Duration'];

/** The colour a signed variance is printed in. Zero is neutral. */
const varianceColour = (v: number): string => {
  const t = varianceTone(v);
  return t === 'grey' ? 'var(--muted)' : `var(--${t})`;
};

const kpiTone = (v: number): KpiTone => {
  const t = varianceTone(v);
  return t === 'grey' ? 'navy' : t;
};

/** Single-project control view: position, curve and top risks in one place. */
export function Overview({ nav }: { nav: NavFn }) {
  const { scope, project: p } = useScope();
  const { months, scurve } = useCorporate();
  const { risks } = useRegisters(p.id);
  const spi = spiOf(p);
  const cpi = cpiOf(p);
  const variance = p.budget - p.afc;
  const details = [p.portfolio, p.route, p.pmc, p.start, p.finish, p.duration];

  // The project's own curve, pinned to its PV, EV and AC at the data date and
  // to its budget at completion — the same rows the Cost Summary draws.
  const rows = monthlyCost(p, months, scurve);
  const topRisks = [...risks].sort((x, y) => y.exposure - x.exposure).slice(0, 5);

  // THE DRILL-IN DOES NOT HELP ITSELF TO A DEVELOPMENT EITHER. It is reached
  // by clicking a development, which sets the scope with it — but a bookmarked
  // or typed `#/overview` at Corporate rendered RES-01's name, budget, curve
  // and risks under a selector that said Corporate. That is the defect the
  // owner reported, on the one screen with no roll-up to move to: an Overview
  // of a portfolio is the Dashboard, which already exists.
  if (scope.level !== 'Project') {
    return (
      <PickDevelopment
        what={'The Project Overview is one development: its position, its curve and its '
          + 'largest risks. The portfolio view of the same figures is the Dashboard.'}
      />
    );
  }

  return (
    <div className="fade-up">
      <ProjBand p={p} metrics={[
        ['Portfolio', p.portfolio],
        ['Delivery Route', p.route],
        ['PMC', p.pmc],
        ['Approved Budget (SAR)', fmt(p.budget)],
        ['AFC (SAR)', fmt(p.afc)],
        ['Budget Variance (SAR)', fmt(variance), varianceColour(variance)],
        ['SPI', idx(spi)],
        ['CPI', idx(cpi)],
      ]} />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 16 }}>
        <KPI icon="wallet" label="Approved Budget (SAR)" value={mn(p.budget)} tone="gold" />
        <KPI icon="afc" label="AFC (SAR)" value={mn(p.afc)} tone="navy" />
        <KPI icon="variance" label="Budget Variance (SAR)" value={mn(variance)} tone={kpiTone(variance)} onClick={() => nav('cost')} />
        <KPI icon="gauge" label="SPI" value={idx(spi)} tone={spi >= 0.95 ? 'green' : spi >= 0.85 ? 'amber' : 'red'} />
        <KPI icon="gauge" label="CPI" value={idx(cpi)} tone={cpi >= 0.95 ? 'green' : cpi >= 0.85 ? 'amber' : 'red'} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr 1fr' }}>
        <div className="card">
          <div className="card-h"><h3>Project Details</h3></div>
          <div className="card-b">
            <div className="kv">
              {DETAIL_LABELS.map((label, i) => (
                <div key={i}>
                  <div className="kv-l">{label}</div>
                  <div className="kv-v">{details[i]}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}><Badge status={p.status} /></div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Performance S-Curve</h3></div>
          <div className="card-b">
            <LineChart money labels={months} xLabel={MONTH_AXIS} series={EV_SERIES(
              rows.map((r) => r.plannedCum), rows.map((r) => r.earnedCum), rows.map((r) => r.actualCum),
            )} />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Top 5 Risks</h3><span className="link" onClick={() => nav('risk')}>View All</span>
          </div>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {topRisks.map((r, i) => (
              <div key={r.id} className="between"
                style={{ padding: '8px 0', borderBottom: i < topRisks.length - 1 ? '1px solid #eef1f6' : 'none', cursor: 'pointer' }}
                onClick={() => nav('risk')}>
                <span style={{ fontSize: 12.5 }}>{r.desc}</span>
                <span className="row" style={{ gap: 8 }}>
                  <b style={{ fontSize: 12 }}>{mn(r.exposure)}</b>
                  <Badge status={riskLevel(r.score)} />
                </span>
              </div>
            ))}
            {topRisks.length === 0 && (
              <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>No risks recorded for this development</div>
            )}
          </div>
        </div>
      </div>

      <MonthlyBreakdown p={positionOfProject(p)} rows={rows} />
    </div>
  );
}
