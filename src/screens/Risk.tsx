import { useState } from 'react';
import type { Risk as RiskItem } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { fmt, mn, pct } from '@/domain/format';
import {
  KPI, Badge, Filters, applyFilters, Drawer, kvGrid, DonutCenter, AuditTimeline, LineChart,
} from '@/components';
import { useScope, useScopedRegisters, useScopedHistory } from '@/state/ScopeProvider';
import { useAuditFor } from '@/state/DataProvider';
import { riskLevel, riskColour, RISK_BAND_TEXT } from '@/domain/risk';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN, type BandMetric } from './shared';
import { SubTabs, useSubTab } from './subtabs';
import { MONTH_AXIS } from '@/domain/calendar';

const COLUMNS = ['Risk ID', 'Risk Description', 'Category', 'Impact', 'Probability', 'Score',
  'Level', 'Exposure (SAR)', 'Owner', 'Status'];

/**
 * The three ratings the register uses for impact and probability, highest
 * first, and their positions ON THE OWNER'S 1–5 SCALE.
 *
 * 5, 3 and 1 rather than 3, 2 and 1. The weights decide what a matrix cell is
 * worth, and they used to top out at 9 — so the matrix scored a worst-case
 * risk 9 while the register beside it scored the same risk 25, and the two
 * disagreed about which band it was in. One scale now: a cell is worth
 * impact × probability on the same 1–25 the confirmed bands describe.
 */
const RATINGS = ['High', 'Medium', 'Low'] as const;
const WEIGHT: Record<string, number> = { High: 5, Medium: 3, Low: 1 };

const CATEGORY_COLOURS = ['#1E9E5A', '#2F6DD0', '#8b5cf6', '#E0902B', '#D24141', '#0B2545', '#9aa7bd', '#C9A227'];

/**
 * A matrix cell's own score, and the colour its band paints.
 *
 * The colour belongs to the POSITION, not to what happens to sit there: that
 * is what a matrix is for — it says what a zone means before anything is
 * plotted in it, so an empty top-right corner still reads as the corner you do
 * not want to fill. Colouring by contents was tried and it emptied the chart,
 * which is a worse answer to the right complaint.
 */
const cellScore = (impact: string, prob: string) =>
  (WEIGHT[impact] ?? 1) * (WEIGHT[prob] ?? 1);

/** Distinct values of one field, in register order, for a filter. */
const options = <T,>(rows: T[], pick: (r: T) => string): string[] =>
  ['All', ...Array.from(new Set(rows.map(pick)))];

/**
 * Risk register and exposure.
 *
 * Exposure is the expected monetary value of the risk to the owner — a
 * potential cost, aggregated into EMV at portfolio level. The matrix and the
 * category breakdown are counted from the register, so they agree with the
 * table beneath them; they used to be two hardcoded arrays that described a
 * register of twenty-eight risks on a screen that listed eight.
 */
export function Risk() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';

  const { risks: rk, mitigations } = useScopedRegisters();
  const history = useScopedHistory();
  const [view, setView] = useSubTab(['Risk Register', 'Mitigation Plans'] as const);
  const [sel, setSel] = useState<Scoped<RiskItem> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // The trail of whichever development the open row belongs to.
  const audit = useAuditFor(sel?.project ?? scope.project);

  const rows = applyFilters(rk, filters, { 'Risk Status': 'status', Category: 'cat', Impact: 'impact', Owner: 'owner' });

  // Derived from the score, never read from the row — see domain/risk.ts.
  const hi = rk.filter((r) => riskLevel(r.score) === 'High').length;
  const me = rk.filter((r) => riskLevel(r.score) === 'Medium').length;
  const lo = rk.filter((r) => riskLevel(r.score).startsWith('Low')).length;
  const exposure = rk.reduce((a, r) => a + r.exposure, 0);

  // Counted from the register: one cell per impact × probability pair.
  const cellRisks = (impact: string, prob: string) =>
    rk.filter((r) => r.impact === impact && r.prob === prob);

  const byCategory = Array.from(rk.reduce((m, r) => m.set(r.cat, (m.get(r.cat) ?? 0) + 1), new Map<string, number>()))
    .sort((a, b) => b[1] - a[1])
    .map(([name, v], i) => ({ name, v, c: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] ?? '#9aa7bd' }));

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Committed Cost (SAR)', fmt(pos.committed)],
        // The programme dates belong to a development. A portfolio has as many
        // of them as it has developments, so at a roll-up the three slots carry
        // what the module is actually about.
        ...(pos.project
          ? ([
            ['Project Duration', pos.project.duration],
            ['Start Date', pos.project.start],
            ['Completion Date', pos.project.finish],
          ] as BandMetric[])
          : ([
            ['Risk Exposure (EMV) (SAR)', fmt(exposure)],
            ['Risks Registered', String(rk.length)],
            ['Rated High', String(hi), hi ? 'var(--red)' : 'var(--green)'],
          ] as BandMetric[])),
      ])} />

      {/*
        minmax(0,1fr), not 1fr: a bare fr track floors at the content's
        min-content width, so the wide register table forced this grid wider
        than its container and pushed the matrix column past the viewport edge.
        .tbl-wrap already scrolls, so letting the track shrink is the fix.
      */}
      <SubTabs
        tabs={['Risk Register', 'Mitigation Plans'] as const}
        active={view}
        onSelect={setView}
        counts={{ 'Risk Register': rk.length, 'Mitigation Plans': mitigations.length }}
      />

      {view === 'Mitigation Plans' ? (
        <div className="card">
          <div className="card-h">
            <h3>Mitigation Plans</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>
              what is being done about the risks worth acting on
            </span>
          </div>
          <div className="card-b">
            {mitigations.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                {rolledUp ? 'No risk in this scope' : 'No risk on this development'} scores 8 or above, so none carries a plan. Writing a
                mitigation for every entry on a register is how a risk process becomes a paperwork
                exercise nobody reads.
              </p>
            ) : (
              <>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Risk', 'The response', 'Owner',
                        'Status', 'Score now', 'Target residual',
                        'Reduction'].map((x) => <th key={x}>{x}</th>)}</tr>
                    </thead>
                    <tbody>
                      {mitigations.map((m) => {
                        // Matched on the development too: RISK-013 exists on
                        // every one of them, and the first match would name
                        // somebody else's risk.
                        const risk = rk.find((r) => r.id === m.risk && r.project === m.project);
                        return (
                          <tr key={rowKey(m.risk, m)}>
                            {rolledUp && <td><span className="tid">{m.project}</span></td>}
                            <td>
                              <span className="tid">{m.risk}</span>
                              <div className="muted" style={{ fontSize: 11 }}>{risk?.desc}</div>
                            </td>
                            <td style={{ whiteSpace: 'normal', maxWidth: 380 }}>{m.response}</td>
                            <td>{m.owner}</td>
                            <td><Badge status={m.status} /></td>
                            <td><b style={{ color: riskColour(m.score) }}>{m.score}</b></td>
                            <td><b style={{ color: riskColour(m.residual) }}>{m.residual}</b></td>
                            <td style={{ color: 'var(--green)' }}>{`\u2212${m.score - m.residual}`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
                  The target residual is what the risk&rsquo;s owner expects the score to become once
                  the response is delivered. It is a target, not a calculation: the register&rsquo;s own
                  score moves when somebody re-scores the risk, and not because a plan was typed.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16 }}>
        <div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 16 }}>
            <KPI icon="risk" label="Total Risks" value={rk.length}
              sub={rolledUp ? 'In scope' : 'On this development'} tone="red" />
            <KPI icon="alert" label="High Risks" value={hi} sub={`${pct(hi, rk.length)} of total`} tone="red" />
            <KPI icon="alert" label="Medium Risks" value={me} sub={`${pct(me, rk.length)} of total`} tone="amber" />
            <KPI icon="shield2" label="Low Risks" value={lo} sub={`${pct(lo, rk.length)} — low and low-medium`} tone="green" />
            <KPI icon="variance" label="Risk Exposure" value={mn(exposure)} sub="Expected monetary value" tone="navy" />
          </div>

          <div className="card">
            <div className="card-b">
              <Filters fields={[
                { label: 'Risk Status', opts: options(rk, (r) => r.status) },
                { label: 'Category', opts: options(rk, (r) => r.cat) },
                { label: 'Impact', opts: ['All', ...RATINGS] },
                { label: 'Owner', opts: options(rk, (r) => r.owner) },
              ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

              <div className="tbl-wrap">
                <table>
                  <thead><tr>
                    {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={rowKey(r.id, r)}
                        className={`click${sel && rowKey(sel.id, sel) === rowKey(r.id, r) ? ' sel' : ''}`}
                        onClick={() => setSel(r)}>
                        {rolledUp && <td><span className="tid">{r.project}</span></td>}
                        <td><span className="tid">{r.id}</span></td>
                        <td>{r.desc}</td>
                        <td><span className="pill b-blue">{r.cat}</span></td>
                        <td><Badge status={r.impact} /></td>
                        <td><Badge status={r.prob} /></td>
                        <td><b style={{ color: riskColour(r.score) }}>{r.score}</b></td>
                        <td><Badge status={riskLevel(r.score)} /></td>
                        <td>{fmt(r.exposure)}</td>
                        <td>{r.owner}</td>
                        <td><Badge status={r.status} /></td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                        {rk.length === 0
                          ? (rolledUp ? 'No risks are recorded in this scope.' : 'No risks are recorded for this development.')
                          : 'No risks match the current filters.'}
                      </td></tr>
                    )}
                    {rows.length > 0 && (
                      <tr className="tbl-total">
                        <td colSpan={rolledUp ? 8 : 7}>{rows.length === rk.length ? 'Total exposure' : `Exposure of ${rows.length} shown`}</td>
                        <td>{fmt(rows.reduce((a, r) => a + r.exposure, 0))}</td>
                        <td colSpan={2} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h"><h3>Risk Matrix</h3></div>
            <div className="card-b">
              <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Impact (rows) × Probability (columns)</div>
              <div className="matrix" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                {RATINGS.map((impact) => RATINGS.slice().reverse().map((prob) => {
                  const score = cellScore(impact, prob);
                  return (
                    <div key={`${impact}-${prob}`} className="cell" style={{ background: riskColour(score) }}
                      title={`${impact} impact · ${prob} probability — score ${score}, ${riskLevel(score).toLowerCase()}`}>
                      {cellRisks(impact, prob).length}
                    </div>
                  );
                }))}
              </div>
              <div className="row" style={{ gap: 12, marginTop: 12, fontSize: 11, justifyContent: 'center' }}>
                {([[`High (${hi})`, '#D24141'], [`Medium (${me})`, '#E0902B'], [`Low (${lo})`, '#1E9E5A']] as const).map((l, i) => (
                  <div key={i} className="row" style={{ gap: 5 }}>
                    <span className="dot" style={{ background: l[1] }} />{l[0]}
                  </div>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.6 }}>
                {`Bands: ${RISK_BAND_TEXT}. A cell is impact × probability on the same scale, `
                  + `so the zone and the register agree about what a score means.`}
              </p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h">
              <h3>Exposure Trend</h3>
              <span className="muted" style={{ fontSize: 11 }}>expected monetary value</span>
            </div>
            <div className="card-b">
              <LineChart
                labels={history.map((m) => m.month)}
                money
                yLabel="Exposure (SAR)"
                xLabel={MONTH_AXIS}
                series={[{ name: 'Exposure (SAR)', color: '#D24141', pts: history.map((m) => m.exposure) }]}
              />
              <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 10 }}>
                The last point is the register&rsquo;s own total. The months before it are modelled
                from the progress {rolledUp ? 'curves of the developments in scope' : "curve of this development"}.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Risk by Category</h3></div>
            <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
              {byCategory.length
                ? <DonutCenter size={150} center={String(rk.length)} sub="Risks" data={byCategory} />
                : <p className="muted" style={{ fontSize: 12 }}>No risks recorded.</p>}
            </div>
          </div>
        </div>

        {sel && (
          <Drawer
            title={sel.id}
            status={sel.status}
            tabs={['Details', 'History']}
            onClose={() => setSel(null)}
          >
            {(tab) =>
              tab === 'History' ? (
                <AuditTimeline events={audit} />
              ) : (
                kvGrid([
                  ['Description', sel.desc], ['Category', sel.cat], ['Impact', sel.impact],
                  ['Probability', sel.prob], ['Risk Score', sel.score], ['Level', riskLevel(sel.score)],
                  ['Exposure — EMV (SAR)', fmt(sel.exposure)], ['Owner', sel.owner],
                ])
              )}
          </Drawer>
        )}
      </div>
      )}
    </div>
  );
}
