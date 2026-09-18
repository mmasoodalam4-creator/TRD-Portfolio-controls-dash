import { useMemo, useState } from 'react';
import type { Assessment } from '@/domain/evaluation';
import { assessCounterparties, JUDGEMENT_CRITERIA } from '@/domain/evaluation';
import { fmt, mn } from '@/domain/format';
import { KPI, Prog, Drawer, kvGrid } from '@/components';
import { useScopedRegisters } from '@/state/ScopeProvider';
import { useAuth } from '@/state/AuthProvider';
import { ScopeBand, bandMetrics } from './shared';

const BAND_TONE: Record<Assessment['band'], string> = {
  'Strong': 'b-green',
  'Satisfactory': 'b-blue',
  'Monitor': 'b-amber',
  'Needs intervention': 'b-red',
};

const COLUMNS = ['Counterparty', 'Engaged as', 'Packages', 'Committed (SAR)',
  'Cost discipline / 20', 'Schedule / 20', 'Claim accuracy / 15', 'Turnaround / 10', 'Quality / 15',
  'Measured / 80', 'Judgement / 20', 'Band'];

/** Who may open this screen at all. Scores are commercially sensitive. */
const ALLOWED = ['reviewer', 'approver', 'admin'];

/**
 * A score per counterparty, built from the data the system already holds.
 *
 * Eighty marks are measured. The remaining twenty are the PMO's own judgement
 * and are not computed: until an assessment is recorded, the score stands at
 * what was measured, out of eighty. Scaling the measured marks up to look like
 * a complete score would present an absence of opinion as an opinion.
 *
 * Restricted to reviewer and above on the owner's instruction. A contributor
 * cannot see a score even for their own development, and the reader role is
 * excluded too.
 */
export function Evaluation() {
  // Scored across everything in scope: a counterparty working on three
  // developments is ONE organisation, and the question an owner has is whether
  // to invite it to tender again — not how it did on one job.
  const { procurement, claims, ncrs, variations, wbs } = useScopedRegisters();
  const { authRequired, account } = useAuth();
  const [sel, setSel] = useState<Assessment | null>(null);

  const rows = useMemo(
    () => assessCounterparties(procurement, claims, ncrs, variations, wbs),
    [procurement, claims, ncrs, variations, wbs],
  );

  // Defence behind the navigation, not instead of it: the sidebar hides the
  // module, and reaching the route by typing it still refuses.
  if (authRequired && !ALLOWED.includes(account?.role ?? '')) {
    return (
      <div className="fade-up">
        <div className="card"><div className="card-b">
          <h3 style={{ fontSize: 15 }}>Not available to your role</h3>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 8, maxWidth: 640 }}>
            Counterparty evaluation is restricted to the reviewer, approver and administrator
            seats. The scores carry commercial weight — they inform whether an organisation is
            invited to tender again — so they are kept to the seats that act on them.
          </p>
        </div></div>
      </div>
    );
  }

  const scored = rows.filter((r) => !r.thin);
  // The list is sorted by committed cost, so "last row" is the smallest
  // commitment, not the lowest score — and a sentence built on it asserted
  // the wrong counterparty. One variable, min by percent, used everywhere.
  const worst = scored.reduce<Assessment | null>(
    (w, r) => (!w || r.percent < w.percent ? r : w), null,
  );
  const needing = rows.filter((r) => !r.thin && (r.band === 'Monitor' || r.band === 'Needs intervention'));

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Counterparties', String(rows.length)],
        ['Committed (SAR)', fmt(pos.committed)],
      ])} />

      <div className="card" style={{ marginBottom: 16, background: 'var(--blue-bg)', borderColor: '#cfe0f6' }}>
        <div className="card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pill b-blue">Restricted</span>
          <span style={{ fontSize: 12.5, color: '#24456F', lineHeight: 1.6 }}>
            Visible to the reviewer, approver and administrator seats only. Project managers and
            executive viewers do not see this module, and it is not in their navigation.
          </span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 16 }}>
        <KPI icon="users" label="Counterparties" value={rows.length}
          sub={`${scored.length} with enough data to score`} tone="navy" />
        <KPI icon="alert" label="Needing attention" value={needing.length}
          sub={needing.length ? needing.map((r) => r.name).join(', ') : 'None below satisfactory'}
          tone={needing.length ? 'amber' : 'green'} />
        <KPI icon="gauge" label="Lowest measured score"
          value={worst ? `${worst.percent}%` : '–'}
          sub={worst ? worst.name : 'Nothing scored yet'}
          tone={worst && worst.percent < 70 ? 'red' : 'green'} />
        <KPI icon="check" label="Judgement recorded" value={`0 of ${rows.length}`}
          sub="No PMO assessment has been entered yet" tone="blue" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-h">
            <h3>Scores this period</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>
              80 measured from data · 20 from PMO judgement, shown separately
            </span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className={`click${sel && sel.name === r.name ? ' sel' : ''}`}
                      onClick={() => setSel(r)}>
                      <td><b>{r.name}</b></td>
                      <td>{r.role}</td>
                      <td>{r.packages}</td>
                      <td>{fmt(r.committed)}</td>
                      {r.criteria.map((c) => (
                        <td key={c.name}>
                          {r.thin && (c.name === 'Claim accuracy' || c.name === 'Claim turnaround')
                            ? <span className="muted">n/a</span>
                            : c.score.toFixed(1)}
                        </td>
                      ))}
                      <td><b>{r.measured.toFixed(1)}</b></td>
                      <td><span className="muted">not assessed</span></td>
                      <td>
                        {r.thin
                          ? <span className="pill b-grey">Too little data</span>
                          : <span className={`pill ${BAND_TONE[r.band]}`}>{r.band}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              Schedule is apportioned from the WBS node each package sits under, by the
              package&rsquo;s share of the commitment in that node; where a node carries one package
              that is exact. Cost discipline, claim accuracy, turnaround and quality are
              attributable without apportionment. Cost is scored as variations rather than as CPI
              because earned value is derived, which makes CPI identical for every package of a
              development — a criterion that gives everybody the same mark discriminates nothing. A counterparty that has not yet claimed is marked
              <b> too little data</b> rather than scored badly — being unmeasured is not a finding.
            </p>
          </div>
        </div>

        {sel && (
          <Drawer
            title={sel.name}
            status={sel.thin ? 'Too little data' : sel.band}
            tabs={['Measured', 'Judgement']}
            onClose={() => setSel(null)}
          >
            {(tab) =>
              tab === 'Judgement' ? (
                <div>
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>
                    Twenty marks the PMO scores by hand, kept apart from the measured eighty so a
                    strong data score with a poor judgement score reads as the disagreement it is.
                  </p>
                  {JUDGEMENT_CRITERIA.map(([name, weight, note]) => (
                    <div key={name} style={{ marginBottom: 14 }}>
                      <div className="between" style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{`— / ${weight}`}</div>
                      </div>
                      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>{note}</div>
                    </div>
                  ))}
                  <div className="card" style={{ background: 'var(--bg)' }}>
                    <div className="card-b">
                      <div style={{ fontWeight: 700, fontSize: 12.5 }}>No assessment recorded</div>
                      <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 6 }}>
                        An assessment carries a score, a written reason and the name of the person
                        who made it, and is filed like any other figure — submitted, reviewed and
                        approved. A number without a reason is not evidence, so entry is not a
                        free-text box beside a slider.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {kvGrid([
                    ['Engaged as', sel.role],
                    ['Packages held', String(sel.packages)],
                    ['Committed (SAR)', fmt(sel.committed)],
                    ['Measured', `${sel.measured.toFixed(1)} of ${sel.measuredOutOf}`],
                    ['As a percentage', `${sel.percent}%`],
                    ['Band', sel.thin ? 'Too little data to band' : sel.band],
                  ])}
                  <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0 14px' }} />
                  {sel.criteria.map((c) => (
                    <div key={c.name} style={{ marginBottom: 14 }}>
                      <div className="between" style={{ marginBottom: 3 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.name}</div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          {`${c.score.toFixed(1)} / ${c.weight}`}
                        </div>
                      </div>
                      <Prog v={Math.round((c.score / c.weight) * 100)} />
                      <div className="muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>
                        {`${c.measured} · ${c.source}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </Drawer>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>How the eighty marks are earned</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>
            Every criterion names the register it reads
          </span>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>{['Criterion', 'Weight', 'Read from', 'Nothing scored at', 'Full marks at']
                  .map((x) => <th key={x}>{x}</th>)}</tr>
              </thead>
              <tbody>
                <tr><td><b>Cost discipline</b></td><td>20</td>
                  <td>Approved variations against their packages, as a share of the award</td>
                  <td>10% of award varied</td><td>Nothing varied</td></tr>
                <tr><td><b>Schedule performance</b></td><td>20</td>
                  <td>WBS earned value against planned value, same apportionment</td>
                  <td>SPI 0.85</td><td>SPI 1.05</td></tr>
                <tr><td><b>Claim accuracy</b></td><td>15</td>
                  <td>Payment claims: approved against claimed</td>
                  <td>85% approved</td><td>100% approved</td></tr>
                <tr><td><b>Claim turnaround</b></td><td>10</td>
                  <td>Payment claims: days from raised to verified</td>
                  <td>21 days</td><td>7 days</td></tr>
                <tr><td><b>Quality</b></td><td>15</td>
                  <td>Quality register, severity-weighted, per 100M committed</td>
                  <td>3 weighted per 100M</td><td>None open</td></tr>
              </tbody>
              <tfoot>
                <tr className="tbl-total">
                  <td>Measured</td><td>80</td>
                  <td colSpan={3}>Plus 20 from PMO judgement, recorded separately</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {worst && (
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              {`In this scope the lowest measured score belongs to ${worst.name} at `}
              {`${worst.percent}% of the marks available, against ${mn(worst.committed)} committed.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
