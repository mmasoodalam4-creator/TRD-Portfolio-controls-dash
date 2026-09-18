import type { NavFn } from '@/app/types';
import type { KpiTone } from '@/components';
import { mn, pct, idx, varianceTone, varianceWord } from '@/domain/format';
import { spiOf } from '@/domain/calc';
import { isHighRisk } from '@/domain/counts';
import { riskLevel } from '@/domain/risk';
import { TONE_HEX } from '@/domain/portfolios';
import { monthlyCost } from '@/domain/forecast';
import { MONTH_AXIS } from '@/domain/calendar';
import { useScope } from '@/state/ScopeProvider';
import { useCorporate, useProjects, useRegistersFor } from '@/state/DataProvider';
import { KPI, Badge, Ic, Info, BarChart, DonutCenter, HBars, LineChart, EV_SERIES } from '@/components';

// The colour a portfolio is drawn in is a property OF THE PORTFOLIO now, not
// a map in this screen. It used to be both: a hex here and a different pill
// class on the Projects register, so Residential was navy in this chart and
// blue in that table — two colour keys for one thing, and neither of them had
// an answer for a portfolio added tomorrow. See `domain/portfolios.ts`.

/** varianceTone as a KPI tile tone — a zero variance is neutral, not a signal. */
const kpiTone = (v: number): KpiTone => {
  const t = varianceTone(v);
  return t === 'grey' ? 'navy' : t;
};

/** A project id as it appears in an activity line ("RES-01 Naseem Residences"). */
const namedProject = (text: string, ids: string[]): string | undefined =>
  ids.find((id) => text.includes(id));

export function Dashboard({ nav }: { nav: NavFn; openAI?: () => void }) {
  const { list, totals: a } = useScope();
  const projects = useProjects();
  const { portfolios, months, scurve, activities } = useCorporate();
  const registersFor = useRegistersFor();
  // Certified is the approved-for-payment position. It is not on the
  // aggregate because only the payment tile reads it, and it belongs beside
  // paid rather than beside the budget figures.
  const certified = list.reduce((t, p) => t + p.ipcSubmitted, 0);
  const spiTone = a.spi >= 1 ? 'green' : a.spi >= 0.9 ? 'amber' : 'red';
  const cpiTone = a.cpi >= 1 ? 'green' : a.cpi >= 0.9 ? 'amber' : 'red';

  // Financial position by portfolio = Approved Budget less AFC. A cost
  // variance, favourable when positive — never a margin.
  const pfData = portfolios
    .map((pf) => {
      const pl = list.filter((p) => p.portfolio === pf.name);
      const signed = pl.reduce((x, p) => x + (p.budget - p.afc), 0);
      return { name: pf.name, v: Math.abs(signed), signed, c: TONE_HEX[pf.tone] };
    })
    .filter((d) => d.v);

  // A RING IS PARTS OF A WHOLE, AND A MIXED-SIGN VARIANCE HAS NO WHOLE.
  //
  // The arcs are sized by magnitude and the centre carries the NET, so while
  // every portfolio is favourable the parts genuinely sum to the middle. The
  // moment one portfolio overruns they stop: a favourable 300M and an adverse
  // 300M would draw as two equal arcs around a centre reading zero, which is a
  // ring stating that nothing is happening on a portfolio in trouble. It does
  // not occur on today's figures, which is exactly why it would have shipped.
  // Where the signs are mixed the totals are reported separately and the ring
  // is not drawn.
  const favourable = pfData.filter((d) => d.signed > 0).reduce((x, d) => x + d.signed, 0);
  const adverse = pfData.filter((d) => d.signed < 0).reduce((x, d) => x + d.signed, 0);
  const mixedVariance = favourable > 0 && adverse < 0;

  // The S-curve is the sum of each in-scope project's own curve, month by
  // month, so it lands on the KPI row above it at every scope. Past the data
  // date EV and AC are null for every project, and stay null in the sum.
  const curves = list.map((p) => monthlyCost(p, months, scurve));
  const sumAt = (i: number, pick: (r: ReturnType<typeof monthlyCost>[number]) => number | null): number | null => {
    const vals = curves.map((c) => (c[i] ? pick(c[i]) : null));
    return vals.some((v) => v === null) ? null : vals.reduce<number>((t, v) => t + (v ?? 0), 0);
  };
  const curve = months.map((month, i) => ({
    month,
    pv: sumAt(i, (r) => r.plannedCum) ?? 0,
    ev: sumAt(i, (r) => r.earnedCum),
    ac: sumAt(i, (r) => r.actualCum),
  }));

  // Top risks from the registers of the projects in scope, by exposure.
  const scopedRisks = list
    .flatMap((p) => registersFor(p.id).risks.map((r) => ({ project: p.id, ...r })))
    .sort((x, y) => y.exposure - x.exposure);
  const topRisks = scopedRisks.slice(0, 5);
  const exposure = scopedRisks.reduce((t, r) => t + r.exposure, 0);
  // Counted from the rows and banded from the score, never read from either
  // stored field — see domain/counts.ts and domain/risk.ts.
  const highRisks = scopedRisks.filter(isHighRisk).length;

  // Activities that name a development are shown only when it is in scope;
  // lines that name none are kept.
  const ids = projects.map((p) => p.id);
  const inScope = new Set(list.map((p) => p.id));
  const recent = activities.filter((ac) => {
    const named = namedProject(`${ac.title} ${ac.sub}`, ids);
    return !named || inScope.has(named);
  });

  return (
    <div className="fade-up">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6,1fr)', marginBottom: 16 }}>
        <KPI icon="wallet" label={<>Approved Budget (SAR) <Info term="bac" /></>}
          value={mn(a.budget)} tone="gold" />
        <KPI icon="afc" label={<>Anticipated Final Cost (AFC) <Info term="afc" /></>}
          value={mn(a.afc)} tone="navy" />
        <KPI icon="variance" label={<>Budget Variance (SAR) <Info term="variance" /></>} value={mn(a.variance)}
          sub={varianceWord(a.variance)}
          tone={kpiTone(a.variance)} onClick={() => nav('cost')} />
        <KPI icon="gauge" label={<>Portfolio SPI <Info term="spi" /></>} value={idx(a.spi)} tone={spiTone} />
        <KPI icon="gauge" label={<>Portfolio CPI <Info term="cpi" /></>} value={idx(a.cpi)} tone={cpiTone} />
        <KPI
          icon="coins"
          label={<>Paid to Date (SAR) <Info term="paid" /></>}
          value={mn(a.paid)}
          sub={<>
            <b>{pct(a.paid, a.committed, 1)}</b>
            {` of committed · certified ${mn(certified)}`}
          </>}
          tone="green"
          onClick={() => nav('cost')}
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16 }}>
        <div className="card">
          <div className="card-h"><h3>Budget vs Anticipated Final Cost (SAR)</h3></div>
          <div className="card-b">
            <BarChart
              money
              series={['Approved Budget', 'Anticipated Final Cost']}
              xLabel="Portfolio"
              groups={portfolios.map((pf) => {
                const pl = list.filter((p) => p.portfolio === pf.name);
                return {
                  label: pf.name.split(' ')[0],
                  bars: [
                    { v: pl.reduce((x, p) => x + p.budget, 0), color: '#0B2545' },
                    { v: pl.reduce((x, p) => x + p.afc, 0), color: '#1E9E5A' },
                  ],
                };
              }).filter((g) => g.bars[0].v)}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Portfolio Financial Position</h3></div>
          <div className="card-b" style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
            {/* The key sits BESIDE this ring rather than under it, because it
                carries each portfolio's signed variance as well as its name —
                a legend with figures in it. `keyBelow` is off so the ring does
                not draw a second, poorer one. */}
            {mixedVariance
              ? (
                <div style={{ alignSelf: 'center', minWidth: 150 }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {mn(favourable + adverse)}
                  </div>
                  <div className="muted" style={{ fontSize: 10.5, marginBottom: 10 }}>Net Variance</div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                    <div>{`${mn(favourable)} favourable`}</div>
                    <div style={{ color: 'var(--red)' }}>{`${mn(Math.abs(adverse))} adverse`}</div>
                  </div>
                  <p className="muted" style={{ fontSize: 10.5, lineHeight: 1.6, marginTop: 8 }}>
                    Both directions are present, so the position is listed rather than ringed —
                    a ring would draw an overrun and a saving as the same slice.
                  </p>
                </div>
              )
              : (
                <DonutCenter
                  keyBelow={false}
                  data={pfData}
                  center={mn(pfData.reduce((x, d) => x + d.signed, 0))}
                  sub="Total Variance"
                />
              )}
            <div className="donut-legend" style={{ justifyContent: 'center' }}>
              {pfData.map((d, i) => (
                <div className="dl-row" key={i} style={{ gap: 16 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="dot" style={{ background: d.c }} />{d.name}
                  </div>
                  <b style={{ color: d.signed < 0 ? 'var(--red)' : undefined }}>{mn(d.signed)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Project Performance (SPI)</h3></div>
          <div className="card-b">
            <HBars max={1.25} fmtV={(v) => v.toFixed(2)} items={list.map((p) => ({
              label: p.id, v: spiOf(p),
              color: spiOf(p) >= 0.95 ? '#1E9E5A' : spiOf(p) >= 0.85 ? '#E0902B' : '#D24141',
            }))} />
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)', marginBottom: 16 }}>
        <div className="card">
          <div className="card-h"><h3>S-Curve (Cumulative)</h3></div>
          <div className="card-b">
            <LineChart money labels={months} xLabel={MONTH_AXIS} series={EV_SERIES(
              curve.map((s) => s.pv), curve.map((s) => s.ev), curve.map((s) => s.ac),
            )} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Top Risks</h3><span className="link" onClick={() => nav('risk')}>View All</span></div>
          <div className="card-b" style={{ paddingTop: 8 }}>
            <div className="tbl-wrap" style={{ border: 'none' }}>
              <table>
                <thead><tr>{['Risk', 'Project', 'Exposure (SAR)', 'Level'].map((x) => <th key={x}>{x}</th>)}</tr></thead>
                <tbody>
                  {topRisks.map((r) => (
                    <tr key={`${r.project}-${r.id}`} className="click" onClick={() => nav('risk')}>
                      <td>{r.desc}</td><td>{r.project}</td><td><b>{mn(r.exposure)}</b></td><td><Badge status={riskLevel(r.score)} /></td>
                    </tr>
                  ))}
                  {topRisks.length === 0 && (
                    <tr><td colSpan={4} className="muted">No risks recorded for the projects in scope</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Recent Activities</h3></div>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recent.map((ac, i) => (
              <div key={i} className="row" style={{ gap: 11, padding: '9px 0', borderBottom: i < recent.length - 1 ? '1px solid #eef1f6' : 'none' }}>
                <div className="kpi-ic" style={{ width: 32, height: 32, background: '#E8EDF5' }}>{Ic(ac.icon, 15, '#13315C')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{ac.title}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{ac.sub}</div>
                </div>
                <div className="muted" style={{ fontSize: 10.5 }}>{ac.time}</div>
              </div>
            ))}
            {recent.length === 0 && (
              <div className="muted" style={{ fontSize: 12, padding: '9px 0' }}>No recent activity for the projects in scope</div>
            )}
          </div>
        </div>

      </div>

      {/*
        Portfolio Summary is a FULL-WIDTH card of its own.
        
        In the demo it was a fourth child of the three-column grid above, so it
        wrapped to an implicit second row: that re-sized the first track to
        726px, squeezed Recent Activities to 187px, and left the Risk Exposure
        card hanging outside the card that was supposed to contain it, its text
        broken to one word a line. It was preserved through the port because
        Phase 1 was a faithful one and the pixel gate caught every attempt to
        tidy it.
        
        The owner asked for it to be fixed. It is now a sibling, which is what
        it always should have been.
      */}
      <div className="card">
        <div className="card-h"><h3>Portfolio Summary</h3><span className="link" onClick={() => nav('projects')}>View Details</span></div>
        <div className="card-b">
          {/*
            The four counts share the space evenly; the Risk Exposure card is
            given a floor of 240px because it carries a sentence rather than a
            figure, and below that its own text is what breaks.
          */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr)) minmax(240px,1.5fr)', gap: 14 }}>
            <KPI icon="projects" label="Total Projects" value={a.count} sub={`${portfolios.length} Portfolios`} tone="blue" />
            <KPI icon="check" label="On Track" value={a.onTrack} sub={pct(a.onTrack, a.count)} tone="green" onClick={() => nav('projects')} />
            <KPI icon="clock" label="At Risk" value={a.atRisk} sub={pct(a.atRisk, a.count)} tone="amber" onClick={() => nav('projects')} />
            <KPI icon="alert" label="Delayed" value={a.delayed} sub={pct(a.delayed, a.count)} tone="red" onClick={() => nav('projects')} />
            {/*
              A call to action, not a metric. It shares the tile's box through
              .cta-card so `.kpi` keeps meaning "a KPI tile" — the layout check
              asserts every .kpi carries a value, and a card wearing the class
              for its looks alone made that assertion unenforceable. The figure
              is the same register total the Top Risks table is cut from.
            */}
            <div className="cta-card" style={{ background: 'var(--blue-bg)', borderColor: '#cfe0f6', cursor: 'pointer' }} onClick={() => nav('risk')}>
              <div className="row" style={{ gap: 11 }}>
                <div className="kpi-ic" style={{ background: '#fff' }}>{Ic('risk', 20, '#2F6DD0')}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{`Risk Exposure ${mn(exposure)}`}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {`${highRisks} high-rated risk${highRisks === 1 ? '' : 's'} across ${scopedRisks.length} registered`}
                  </div>
                  <div className="link" style={{ fontSize: 11.5, marginTop: 3 }}>View Risk Register →</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
