import { fmt, pct } from '@/domain/format';
import { KPI, Badge, HBars, Donut, LineChart, Prog } from '@/components';
import { countBy, CATEGORY_COLOURS } from '@/components/charts/breakdown';
import { safetyRates } from '@/domain/history';
import { useScope, useScopedRegisters, useScopedHistory } from '@/state/ScopeProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';
import { SubTabs, useSubTab } from './subtabs';
import { MONTH_AXIS } from '@/domain/calendar';

const TABS = ['Overview', 'Incidents', 'Observations', 'Inspections', 'Training & Permits'] as const;

/**
 * Health, safety and environment.
 *
 * TRIR AND LTIFR ARE COMPUTED, NEVER TYPED. They were literals — the same 0.45
 * and 0.31 on every development, whatever its workforce or its incidents,
 * which is a rate that describes nothing. Both are now recordable and
 * lost-time events per 200,000 exposure hours, from the incident register and
 * the manpower register's own hours, so they move when either does and two
 * developments of different sizes report different numbers.
 *
 * The incident trend is COUNTED FROM THE ROWS' OWN DATES. It used to spread
 * the register's total across the year on the progress curve, which meant the
 * shape was the allocation rule's rather than the register's — and every rule
 * left its own fingerprint. Every incident carries a date, so there was never
 * anything to model. The card says which months the register covers, and a
 * month with no row is left out rather than drawn as a month with no
 * incidents: what a chart is honest about is as much a part of it as what it
 * draws.
 */
export function Hse() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';
  const {
    manpower, incidents, observations, hseInspections, training, permits,
  } = useScopedRegisters();
  const [view, setView] = useSubTab(TABS);

  const history = useScopedHistory();
  const rates = safetyRates(history);

  const exposureHours = manpower.reduce((a, m) => a + m.hours, 0);
  const headcount = manpower.reduce((a, m) => a + m.total, 0);
  const daysLost = incidents.reduce((a, i) => a + i.daysLost, 0);
  const nearMisses = incidents.filter((i) => i.classification === 'Near Miss').length;

  const findings = hseInspections.reduce((a, i) => a + i.findings, 0);
  const compliant = hseInspections.filter((i) => i.result === 'Compliant').length;
  const inspectionScore = hseInspections.length
    ? Math.round((compliant / hseInspections.length) * 100) : 0;

  const trainingRequired = training.reduce((a, t) => a + t.required, 0);
  const trainingDone = training.reduce((a, t) => a + t.completed, 0);
  const permitTotals = permits.reduce(
    (a, t) => ({
      issued: a.issued + t.issued, active: a.active + t.active,
      closed: a.closed + t.closed, rejected: a.rejected + t.rejected,
    }),
    { issued: 0, active: 0, closed: 0, rejected: 0 },
  );

  // MEASURED, NOT MODELLED — the months the incident register covers, counted
  // off the rows' own dates. See countByMonth in domain/history.ts. A month
  // before the register's first row is left out rather than drawn as a zero;
  // no record is not the same fact as no incident.
  const recorded = history.filter((m) => m.incidents !== null);

  const counted = (
    <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 10 }}>
      {`Counted from the date on each of the ${incidents.length} incidents on the register, so the `}
      months shown are the months it covers and they sum to it. A month with nothing recorded is
      left off rather than drawn as a month with no incidents.
    </p>
  );

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Exposure Manhours', fmt(exposureHours)],
        ['TRIR', rates.trir.toFixed(2), rates.trir <= 1 ? 'var(--green)' : 'var(--red)'],
        ['LTIFR', rates.ltifr.toFixed(2), rates.ltifr <= 0.5 ? 'var(--green)' : 'var(--red)'],
        ['Workforce on Site', String(headcount)],
      ])} />

      <SubTabs
        tabs={TABS}
        active={view}
        onSelect={setView}
        counts={{
          Incidents: incidents.length,
          Observations: observations.length,
          Inspections: hseInspections.length,
        }}
      />

      {view === 'Incidents' ? (
        <div className="card">
          <div className="card-h">
            <h3>Incident Register</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>every event, including the ones that hurt nobody</span>
          </div>
          <div className="card-b">
            {incidents.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                No workforce is recorded {rolledUp ? 'in this scope' : 'on this development'}, so there is no exposure and no
                incident register.
              </p>
            ) : (
              <>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 14 }}>
                  <KPI icon="alert" label="Incidents" value={incidents.length} sub={rolledUp ? 'In scope' : 'On this development'} tone="amber" />
                  <KPI icon="hse" label="Recordable" value={rates.recordable} sub={`TRIR ${rates.trir.toFixed(2)}`} tone="red" />
                  <KPI icon="clock" label="Days Lost" value={daysLost} sub="Restricted or absent" tone="navy" />
                  <KPI icon="shield2" label="Near Misses" value={nearMisses} sub="Nobody was hurt" tone="green" />
                </div>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Ref', 'Date', 'Classification',
                        'Severity', 'Location', 'What happened', 'Days lost', 'Status',
                        'Investigated by'].map((x) => <th key={x}>{x}</th>)}</tr>
                    </thead>
                    <tbody>
                      {incidents.map((i) => (
                        <tr key={rowKey(i.id, i)}>
                          {rolledUp && <td><span className="tid">{i.project}</span></td>}
                          <td><span className="tid">{i.id}</span></td>
                          <td>{i.date}</td>
                          <td>{i.classification}</td>
                          <td><Badge status={i.severity} /></td>
                          <td>{i.location}</td>
                          <td style={{ whiteSpace: 'normal', maxWidth: 340 }}>{i.what}</td>
                          <td>{i.daysLost || '–'}</td>
                          <td><Badge status={i.status} /></td>
                          <td>{i.investigatedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
                  {`${nearMisses} of these ${incidents.length} injured nobody. A register that holds `}
                  only injuries reports the past; one that holds near misses is the only warning an
                  owner gets in advance.
                </p>
              </>
            )}
          </div>
        </div>
      ) : view === 'Observations' ? (
        <div className="card">
          <div className="card-h">
            <h3>Observations</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>what somebody saw, and whether it was put right</span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Ref', 'Date', 'Category', 'Type',
                    'Location', 'Observation', 'Raised by',
                    'Status'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {observations.map((o) => (
                    <tr key={rowKey(o.id, o)}>
                      {rolledUp && <td><span className="tid">{o.project}</span></td>}
                      <td><span className="tid">{o.id}</span></td>
                      <td>{o.date}</td>
                      <td><span className="pill b-blue">{o.category}</span></td>
                      <td>{o.type}</td>
                      <td>{o.location}</td>
                      <td style={{ whiteSpace: 'normal', maxWidth: 340 }}>{o.what}</td>
                      <td>{o.raisedBy}</td>
                      <td><Badge status={o.status} /></td>
                    </tr>
                  ))}
                  {observations.length === 0 && (
                    <tr><td colSpan={rolledUp ? 9 : 8} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      {rolledUp ? 'No observations are recorded in this scope.' : 'No observations are recorded on this development.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              Good practice is recorded alongside the hazards. A register that only ever notes what
              went wrong teaches people that reporting is a punishment.
            </p>
          </div>
        </div>
      ) : view === 'Inspections' ? (
        <div className="card">
          <div className="card-h">
            <h3>HSE Inspections</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>a major non-conformance stops the activity</span>
          </div>
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="hse" label="Inspections" value={hseInspections.length} sub={rolledUp ? 'In scope' : 'On this development'} tone="blue" />
              <KPI icon="check" label="Inspection Score" value={`${inspectionScore}%`} sub="Compliant first time" tone={inspectionScore >= 85 ? 'green' : 'amber'} />
              <KPI icon="alert" label="Findings" value={findings} sub="Raised across all areas" tone="red" />
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Ref', 'Date', 'Area inspected',
                    'Location', 'Result', 'Findings',
                    'Inspector'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {hseInspections.map((h) => (
                    <tr key={rowKey(h.id, h)}>
                      {rolledUp && <td><span className="tid">{h.project}</span></td>}
                      <td><span className="tid">{h.id}</span></td>
                      <td>{h.date}</td>
                      <td>{h.area}</td>
                      <td>{h.location}</td>
                      <td><Badge status={h.result === 'Compliant' ? 'On Track' : h.result === 'Major NC' ? 'Overdue' : 'At Risk'} label={h.result} /></td>
                      <td>{h.findings || '–'}</td>
                      <td>{h.inspector}</td>
                    </tr>
                  ))}
                  {hseInspections.length === 0 && (
                    <tr><td colSpan={rolledUp ? 8 : 7} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      {rolledUp ? 'No HSE inspections are recorded in this scope.' : 'No HSE inspections are recorded on this development.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : view === 'Training & Permits' ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
          <div className="card">
            <div className="card-h">
              <h3>Training</h3>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {trainingRequired ? `${pct(trainingDone, trainingRequired)} compliant` : ''}
              </span>
            </div>
            <div className="card-b">
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>{['Course', 'Who needs it', 'Required', 'Completed',
                      'Compliance'].map((x) => <th key={x}>{x}</th>)}</tr>
                  </thead>
                  <tbody>
                    {training.map((t) => (
                      <tr key={t.course}>
                        <td><b>{t.course}</b></td>
                        <td>{t.whoNeedsIt}</td>
                        <td>{t.required}</td>
                        <td>{t.completed}</td>
                        <td style={{ width: 140 }}>
                          <Prog v={t.required ? Math.round((t.completed / t.required) * 100) : 0} />
                        </td>
                      </tr>
                    ))}
                    {training.length === 0 && (
                      <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                        No workforce is recorded, so no course is required.
                      </td></tr>
                    )}
                  </tbody>
                  {training.length > 0 && (
                    <tfoot>
                      <tr className="tbl-total">
                        <td colSpan={2}>Total</td>
                        <td>{trainingRequired}</td>
                        <td>{trainingDone}</td>
                        <td>{pct(trainingDone, trainingRequired)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
                A course is required only where somebody {rolledUp ? 'in this scope' : 'on this development'} needs it, so the
                compliance figure is measured against the trades actually on site.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Permit to Work</h3>
              <span className="muted" style={{ fontSize: 11.5 }}>{`${permitTotals.issued} issued`}</span>
            </div>
            <div className="card-b">
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>{['Permit type', 'Where', 'Issued', 'Active', 'Closed',
                      'Rejected'].map((x) => <th key={x}>{x}</th>)}</tr>
                  </thead>
                  <tbody>
                    {permits.map((t) => (
                      <tr key={t.type}>
                        <td><b>{t.type}</b></td>
                        <td>{t.where}</td>
                        <td>{t.issued}</td>
                        <td>{t.active}</td>
                        <td>{t.closed}</td>
                        <td style={{ color: t.rejected ? 'var(--red)' : 'var(--muted)' }}>{t.rejected}</td>
                      </tr>
                    ))}
                    {permits.length === 0 && (
                      <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                        No workforce is recorded, so no permit has been issued.
                      </td></tr>
                    )}
                  </tbody>
                  {permits.length > 0 && (
                    <tfoot>
                      <tr className="tbl-total">
                        <td colSpan={2}>Total</td>
                        <td>{permitTotals.issued}</td>
                        <td>{permitTotals.active}</td>
                        <td>{permitTotals.closed}</td>
                        <td>{permitTotals.rejected}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
                A rejected permit is a good outcome, not a failure: the control worked before the
                work started, which is the only time it can.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 16 }}>
              <KPI icon="manpower" label="Exposure Manhours" value={fmt(rates.hours)}
                sub="Cumulative, from the manpower register" tone="blue" />
              <KPI icon="hse" label="TRIR" value={rates.trir.toFixed(2)}
                sub="Recordable per 200,000 hours" tone={rates.trir <= 1 ? 'green' : 'red'} />
              <KPI icon="hse" label="LTIFR" value={rates.ltifr.toFixed(2)}
                sub="Lost time per 200,000 hours" tone={rates.ltifr <= 0.5 ? 'green' : 'red'} />
              <KPI icon="alert" label="Incidents" value={incidents.length}
                sub={`${nearMisses} near misses`} tone="amber" />
              <KPI icon="check" label="Inspection Score" value={`${inspectionScore}%`}
                sub={`${hseInspections.length} inspections`} tone={inspectionScore >= 85 ? 'green' : 'amber'} />
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}>
              <div className="card">
                <div className="card-h">
                  <h3>Incident Trend</h3>
                  <span className="muted" style={{ fontSize: 11 }}>against exposure hours worked</span>
                </div>
                <div className="card-b">
                  {/* The axis covers the months the INCIDENT REGISTER covers.
                      Drawing it across a year the register says nothing about
                      leaves a reader to read the silence as a clean month. */}
                  <LineChart
                    integer
                    yLabel="Incidents in month"
                    xLabel={MONTH_AXIS}
                    labels={recorded.map((m) => m.month)}
                    series={[
                      { name: 'All incidents', color: CATEGORY_COLOURS[0], pts: recorded.map((m) => m.incidents) },
                      { name: 'Recordable', color: '#D24141', pts: recorded.map((m) => m.recordable) },
                      { name: 'Lost time', color: '#E0902B', pts: recorded.map((m) => m.lostTime) },
                    ]}
                  />
                  {counted}
                </div>
              </div>
              <div className="card">
                <div className="card-h"><h3>Incidents by Classification</h3></div>
                <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
                  {incidents.length
                    ? (
                      <Donut
                        data={countBy(incidents, (i) => i.classification)}
                        total={String(incidents.length)}
                        label="incidents"
                        size={140}
                      />
                    )
                    : <p className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>No incidents recorded.</p>}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><h3>Exposure Hours by Trade</h3></div>
              <div className="card-b">
                {manpower.length
                  ? <HBars items={manpower.map((m) => ({ label: m.trade, v: m.hours, color: CATEGORY_COLOURS[0] }))} fmtV={fmt} />
                  : <p className="muted" style={{ fontSize: 12 }}>{rolledUp ? 'No workforce is recorded in this scope.' : 'No workforce is recorded for this development.'}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
