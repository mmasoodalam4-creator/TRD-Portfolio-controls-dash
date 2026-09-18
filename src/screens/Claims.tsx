import { useState } from 'react';
import type { ClaimState, PaymentClaim } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { fmt, mn, pct } from '@/domain/format';
import { KPI, Info, Prog, Filters, applyFilters, Drawer, kvGrid, AuditTimeline } from '@/components';
import { useAuth } from '@/state/AuthProvider';
import { RecordClaim } from './RecordClaim';
import { ConfirmPayment } from './ConfirmPayment';
import { useScope, useScopedRegisters } from '@/state/ScopeProvider';
import { useAuditFor, useProjects } from '@/state/DataProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';

const COLUMNS = ['Claim', 'Package', 'Counterparty', 'Milestone', 'Raised',
  'Claimed (SAR)', 'Verified (SAR)', 'Verified by / on', 'Approved (SAR)',
  'Ret. %', 'Withheld (SAR)', 'Paid (SAR)', 'State'];

/** The stages a claim passes through, in order, and what each is waiting on. */
const STAGES: [string, ClaimState[], string][] = [
  ['Raised', ['With consultant', 'With approver', 'Approved', 'Part paid', 'Paid'], 'Every claim the contractor has submitted'],
  ['Verified by consultant', ['With approver', 'Approved', 'Part paid', 'Paid'], 'Measured and certified as delivered'],
  ['Approved by Tazayud', ['Approved', 'Part paid', 'Paid'], 'Accepted for payment'],
  ['Paid', ['Part paid', 'Paid'], 'Money has left the account'],
];

const STATE_TONE: Record<ClaimState, string> = {
  'With consultant': 'b-grey',
  'With approver': 'b-blue',
  'Approved': 'b-amber',
  'Part paid': 'b-amber',
  'Paid': 'b-green',
};

/**
 * The claim pipeline, the register behind it, and the money held as security.
 *
 * Payment is milestone-based. A contractor delivers a milestone and claims for
 * it; the consultant verifies what was delivered; Tazayud approves an amount
 * and withholds a percentage of it. Every figure here is a cost to the owner.
 *
 * The consultant does not hold an account in this system, so verification is
 * recorded as a fact — who, when, against what reference, for how much — by
 * the person who received it. That is a deliberate limit: it keeps the access
 * model as it is, and it means the verification column is a record of
 * something that happened rather than something the system watched happen.
 */
export function Claims() {
  const { scope, project, list } = useScope();
  const rolledUp = scope.level !== 'Project';
  const projects = useProjects();
  const { claims, procurement } = useScopedRegisters();
  const { authRequired, account } = useAuth();
  // Recording a claim carries an approval, so the button is shown to the
  // seats that may take it. The server refuses it for anyone else whatever
  // the screen offers.
  const mayRecord = !authRequired || account?.role === 'approver' || account?.role === 'admin';
  // Confirming that money left the account is the same seat, and on the
  // owner's instruction it is a SEPARATE act from approving the claim: paid is
  // confirmed, never inferred from an approval.
  const mayPay = mayRecord;
  const [sel, setSel] = useState<Scoped<PaymentClaim> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // A claim belongs to ONE development. The row says which, and that is the
  // development a confirmed payment is filed against and whose trail is shown.
  const owner = sel?.project ?? scope.project;
  const audit = useAuditFor(owner);

  const sum = (pick: (c: PaymentClaim) => number): number => claims.reduce((a, c) => a + pick(c), 0);
  const approved = sum((c) => c.approved ?? 0);
  const withheld = sum((c) => c.retention);
  const released = sum((c) => c.released);
  const held = withheld - released;
  const paid = sum((c) => c.paid);
  const awaiting = approved - withheld + released - paid;
  // The position the claims were apportioned against — one development's, or
  // the scope's. Controls 19 and 20 hold the register to exactly these two.
  const certified = list.reduce((a, x) => a + x.ipcSubmitted, 0);
  const transferred = list.reduce((a, x) => a + x.paid, 0);

  const rows = applyFilters(claims, filters, { State: 'state', Counterparty: 'contractor' });
  const counterparties = [...new Set(claims.map((c) => c.contractor))].sort();

  const stageValue = (states: ClaimState[]): number => claims
    .filter((c) => states.includes(c.state))
    .reduce((a, c) => {
      if (states.length === 5) return a + c.claimed;
      if (states.length === 4) return a + (c.verified ?? 0);
      if (states.length === 3) return a + (c.approved ?? 0);
      return a + c.paid;
    }, 0);

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Certified (SAR)', fmt(pos.certified)],
        ['Paid to Date (SAR)', fmt(pos.paid)],
      ])} />

      {mayRecord && (rolledUp
        ? (
          <p className="form-hint" style={{ marginBottom: 16 }}>
            A claim is recorded against one development. Choose it in the scope selector, or open
            it in the Project Workspace, and the form appears here.
          </p>
        )
        // Keyed by the development: the form seeds its package selection from
        // the register once, and a scope change swapped the register under a
        // selection that then named a DIFFERENT counterparty's package of the
        // same id. A new development is a new form.
        : <RecordClaim key={project.id} p={project} packages={procurement} />)}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>The claim pipeline</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {`${claims.length} claims · how many have reached each stage, and for how much`}
          </span>
        </div>
        <div className="card-b">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
            {STAGES.map(([label, states, note]) => (
              <KPI
                key={label}
                icon={label === 'Paid' ? 'coins' : label === 'Raised' ? 'file' : 'check'}
                label={label}
                value={claims.filter((c) => states.includes(c.state)).length}
                sub={`${mn(stageValue(states))} · ${note}`}
                tone={label === 'Paid' ? 'green' : 'navy'}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 16 }}>
        <KPI icon="shield2" label={<>Held as Security <Info term="retention" /></>} value={mn(held)}
          sub={`${pct(held, approved, 1)} of approved`} tone="gold" />
        <KPI icon="check" label="Withheld to Date" value={mn(withheld)}
          sub="Deducted from approved claims" tone="navy" />
        <KPI icon="download" label="Released to Date" value={mn(released)}
          sub={released ? 'Returned to counterparties' : 'Nothing released yet'} tone="blue" />
        <KPI icon="clock" label="Approved, Awaiting Payment" value={mn(awaiting)}
          sub={awaiting ? 'Accepted but not yet transferred' : 'Nothing outstanding'} tone="amber" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-b">
            <Filters fields={[
              {
                label: 'State',
                opts: ['All', 'With consultant', 'With approver', 'Approved', 'Part paid', 'Paid'],
              },
              { label: 'Counterparty', opts: ['All', ...counterparties] },
            ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={rowKey(c.id, c)}
                      className={`click${sel && rowKey(sel.id, sel) === rowKey(c.id, c) ? ' sel' : ''}`}
                      onClick={() => setSel(c)}>
                      {rolledUp && <td><span className="tid">{c.project}</span></td>}
                      <td><span className="tid">{c.id}</span></td>
                      <td>{c.packageId}</td>
                      <td>{c.contractor}</td>
                      <td>{c.milestone}</td>
                      <td>{c.raised}</td>
                      <td>{fmt(c.claimed)}</td>
                      <td>{c.verified === null ? <span className="muted">—</span> : fmt(c.verified)}</td>
                      <td>{c.verifiedBy
                        ? <span style={{ fontSize: 11.5 }}>{`${c.verifiedBy} · ${c.verifiedOn ?? ''}`}</span>
                        : <span className="muted">awaiting</span>}</td>
                      <td>{c.approved === null ? <span className="muted">—</span> : fmt(c.approved)}</td>
                      <td>{c.retentionRate ? `${c.retentionRate}%` : <span className="muted">none</span>}</td>
                      <td>{c.retention ? fmt(c.retention) : <span className="muted">—</span>}</td>
                      <td>{c.paid ? fmt(c.paid) : <span className="muted">—</span>}</td>
                      <td><span className={`pill ${STATE_TONE[c.state]}`}>{c.state}</span></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      No claims match the current filters.
                    </td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="tbl-total">
                    <td colSpan={rolledUp ? 6 : 5}>All {claims.length} claims — reconciled by controls 19 and 20</td>
                    <td>{fmt(sum((c) => c.claimed))}</td>
                    <td>{fmt(sum((c) => c.verified ?? 0))}</td>
                    <td />
                    <td>{fmt(approved)}</td>
                    <td />
                    <td>{fmt(withheld)}</td>
                    <td>{fmt(paid)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              {`Approvals sum to the ${mn(certified)} certified ${rolledUp ? 'in this scope' : 'on this development'}, and transfers to the `}
              {`${mn(transferred)} paid. The difference is ${mn(held)} held as security`}
              {awaiting ? ` and ${mn(awaiting)} approved but not yet transferred.` : '.'}
            </p>
          </div>
        </div>

        {sel && (
          <Drawer
            title={sel.id}
            status={sel.state}
            tabs={['Overview', 'History']}
            onClose={() => setSel(null)}
          >
            {(tab) =>
              tab === 'History' ? (
                <AuditTimeline events={audit} />
              ) : (
                <div>
                  {kvGrid([
                    ...(sel.project ? [['Development', sel.project] as [string, string]] : []),
                    ['Package', sel.packageId], ['Counterparty', sel.contractor],
                    ['Milestone claimed', sel.milestone], ['Raised', sel.raised],
                    ['Claimed (SAR)', fmt(sel.claimed)],
                    ['Verified (SAR)', sel.verified === null ? 'Not yet verified' : fmt(sel.verified)],
                    ['Verified by', sel.verifiedBy ?? 'Awaiting the consultant'],
                    ['Verified on', sel.verifiedOn ?? '—'],
                    ['Verification reference', sel.verifiedRef ?? '—'],
                    ['Approved (SAR)', sel.approved === null ? 'Not yet approved' : fmt(sel.approved)],
                    ['Retention rate on this claim', sel.retentionRate ? `${sel.retentionRate}%` : 'None'],
                    ['Withheld (SAR)', fmt(sel.retention)],
                    ['Released (SAR)', fmt(sel.released)],
                    ['Still held as security (SAR)', fmt(sel.retention - sel.released)],
                    ['Paid (SAR)', fmt(sel.paid)],
                    ['Paid on', sel.paidOn ?? 'Not yet transferred'],
                  ])}
                  {sel.approved !== null && sel.claimed > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div className="kv-l" style={{ marginBottom: 6 }}>
                        {`Approved of claimed — ${pct(sel.approved, sel.claimed, 1)}`}
                      </div>
                      <Prog v={Math.round((sel.approved / sel.claimed) * 100)} />
                    </div>
                  )}
                  <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 14 }}>
                    The retention rate is a percentage of this claim, not of the contract. It starts
                    from the package&rsquo;s payment terms and is set on every claim, because terms
                    differ between claims. What is withheld is released at handover and closeout.
                  </p>

                  {/* PAID IS CONFIRMED, NEVER INFERRED. Approving a claim says
                      what a contractor is owed; this says the owner has paid
                      it. Offered to the seat that may take the act, and said
                      plainly to every other one — a claim that sits at
                      Approved with no explanation reads as a system that has
                      lost track of the money. */}
                  {/* A PAID claim can still hold security: what was withheld
                      from it is released at handover and closeout, and that
                      release is the same act — money leaving the account — so
                      it is the same form. Without this arm, a development
                      whose every claim was settled had no door to return the
                      retention it held. */}
                  {sel.approved !== null && (
                    mayPay
                      ? ((sel.state !== 'Paid' || sel.retention - sel.released > 0) && (
                        <ConfirmPayment
                          p={projects.find((x) => x.id === owner) ?? project}
                          claim={sel}
                          onDone={() => { setSel(null); }}
                        />
                      ))
                      : sel.state !== 'Paid' ? (
                        <p className="form-hint">
                          Approved, and not yet transferred. The PMO manager confirms a payment —
                          nothing here marks a claim paid because it was approved.
                        </p>
                      ) : null
                  )}
                </div>
              )}
          </Drawer>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>Retention held, by counterparty</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>Released at handover and closeout</span>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>{['Counterparty', 'Claims', 'Approved (SAR)', 'Withheld (SAR)',
                  'Released (SAR)', 'Held as Security (SAR)', 'Effective rate'].map((x) => <th key={x}>{x}</th>)}</tr>
              </thead>
              <tbody>
                {counterparties.map((name) => {
                  const own = claims.filter((c) => c.contractor === name);
                  const a = own.reduce((t, c) => t + (c.approved ?? 0), 0);
                  const w = own.reduce((t, c) => t + c.retention, 0);
                  const r = own.reduce((t, c) => t + c.released, 0);
                  return (
                    <tr key={name}>
                      <td><b>{name}</b></td>
                      <td>{own.length}</td>
                      <td>{fmt(a)}</td>
                      <td>{fmt(w)}</td>
                      <td>{r ? fmt(r) : <span className="muted">—</span>}</td>
                      <td>{fmt(w - r)}</td>
                      <td>{a ? pct(w, a, 1) : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="tbl-total">
                  <td>Total</td>
                  <td>{claims.length}</td>
                  <td>{fmt(approved)}</td>
                  <td>{fmt(withheld)}</td>
                  <td>{fmt(released)}</td>
                  <td>{fmt(held)}</td>
                  <td>{approved ? pct(withheld, approved, 1) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
