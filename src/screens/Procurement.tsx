import { useState } from 'react';
import type { CounterpartyRole, ProcurementPackage } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { fmt, mn, pct } from '@/domain/format';
import {
  KPI, Badge, Info, Prog, Filters, applyFilters, Drawer, kvGrid, AuditTimeline, HBars,
} from '@/components';
import { useAuth } from '@/state/AuthProvider';
import { useScope, useScopedRegisters } from '@/state/ScopeProvider';
import { useAuditFor } from '@/state/DataProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';
import { SubTabs, useSubTab } from './subtabs';
import { AwardContract } from './AwardContract';

const COLUMNS = ['Package No.', 'Contract / Scope', 'WBS', 'Contractor', 'Role',
  'Award Value (SAR)', 'Committed (SAR)', 'Paid to Date (SAR)', 'Retention', 'Awarded', 'Status', 'Progress'];

const ROLE_TONE: Record<CounterpartyRole, string> = {
  'Main Contractor': 'b-blue',
  'Trade Contractor': 'b-blue',
  'Supplier': 'b-grey',
  'PMC': 'b-amber',
  'Design Consultant': 'b-amber',
  'Verification Consultant': 'b-amber',
};

/** One counterparty's position across every package it holds on this development. */
interface Counterparty {
  name: string;
  role: CounterpartyRole;
  packages: number;
  value: number;
  committed: number;
  paid: number;
}

/**
 * Roll the package register up by who holds it.
 *
 * The register is the record of what was bought; this is the record of who is
 * owed. A counterparty with four packages on one development is one commercial
 * relationship, and the evaluation scorecard scores the relationship, not the
 * package.
 */
function byCounterparty(rows: ProcurementPackage[]): Counterparty[] {
  const out = new Map<string, Counterparty>();
  for (const x of rows) {
    const at = out.get(x.contractor) ?? {
      name: x.contractor, role: x.role, packages: 0, value: 0, committed: 0, paid: 0,
    };
    at.packages += 1;
    at.value += x.value;
    at.committed += x.committed;
    at.paid += x.paid;
    out.set(x.contractor, at);
  }
  return [...out.values()].sort((a, b) => b.committed - a.committed);
}

/**
 * Packages, the counterparty holding each, and what has been committed and paid.
 *
 * Award Value and Committed are amounts the owner has committed to spend; Paid
 * to Date is what has left the owner's account. All costs.
 *
 * A package still out to tender carries an award estimate and **no**
 * commitment — nobody has been promised anything — so it appears here with a
 * dash in the Committed column and does not reach control 7.
 */
export function Procurement() {
  const { scope, totals, project } = useScope();
  const rolledUp = scope.level !== 'Project';
  const { authRequired, account } = useAuth();
  // Awarding a contract is a commercial act — the seats that register a
  // development and approve its claims, mirrored here so nobody is offered a
  // form the server would refuse. The server refuses it regardless.
  const mayAward = !authRequired || account?.role === 'approver' || account?.role === 'admin';

  const { procurement: pk } = useScopedRegisters();
  const [sel, setSel] = useState<Scoped<ProcurementPackage> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // The trail of whichever development the open package belongs to.
  const audit = useAuditFor(sel?.project ?? scope.project);

  const committed = pk.reduce((a, x) => a + x.committed, 0);
  const paid = pk.reduce((a, x) => a + x.paid, 0);
  const tendered = pk.filter((x) => x.awarded === null);
  const [view, setView] = useSubTab(['Packages', 'Tender Pipeline'] as const);
  const awardedValue = pk.filter((x) => x.awarded !== null).reduce((a, x) => a + x.value, 0);
  // The awarded packages, and what has been drawn down against them.
  const awarded = pk.filter((x) => x.awarded !== null);
  const committedTotal = awarded.reduce((a, x) => a + x.committed, 0);
  const paidTotal = awarded.reduce((a, x) => a + x.paid, 0);
  const rows = applyFilters(pk, filters, {
    Status: 'status', Category: 'cat', Role: 'role',
  });
  const parties = byCounterparty(pk);

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Committed (SAR)', fmt(committed)],
        ['Paid to Date (SAR)', fmt(paid)],
      ])} />

      <SubTabs
        tabs={['Packages', 'Tender Pipeline'] as const}
        active={view}
        onSelect={setView}
        counts={{ Packages: pk.length, 'Tender Pipeline': tendered.length }}
      />

      {view === 'Tender Pipeline' ? (
        <div className="card">
          <div className="card-h">
            <h3>Tender Pipeline</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>
              an estimate and a place in the forecast — not an obligation
            </span>
          </div>
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="cart" label="Out to Tender" value={tendered.length} sub="Not yet awarded" tone="blue" />
              <KPI icon="wallet" label="Estimated Value"
                value={mn(tendered.reduce((a, x) => a + x.value, 0))} sub="Carried in the AFC" tone="navy" />
              <KPI icon="check" label="Committed by These" value="0"
                sub="Nobody has been promised anything" tone="green" />
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Package', 'Scope', 'Category',
                    'Engaged as', 'Estimate (SAR)', 'WBS'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {tendered.map((x) => (
                    <tr key={rowKey(x.id, x)}>
                      {rolledUp && <td><span className="tid">{x.project}</span></td>}
                      <td><span className="tid">{x.id}</span></td>
                      <td><b>{x.name}</b></td>
                      <td><span className="pill b-blue">{x.cat}</span></td>
                      <td>{x.role}</td>
                      <td>{fmt(x.value)}</td>
                      <td>{x.wbs}</td>
                    </tr>
                  ))}
                  {tendered.length === 0 && (
                    <tr><td colSpan={rolledUp ? 7 : 6} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      Every package {rolledUp ? 'in this scope' : 'on this development'} has been awarded.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              None of this reaches committed cost. An un-awarded package carries an estimate and a
              place in the AFC; the commitment control sums awarded contracts only, so a tender
              cannot inflate what the owner owes.
            </p>
          </div>
        </div>
      ) : (
        <>
      {mayAward && (rolledUp
        ? (
          <p className="form-hint" style={{ marginBottom: 16 }}>
            A package is recorded against one development. Choose it in the scope selector, or open
            it in the Project Workspace, and the form appears here.
          </p>
        )
        // Keyed by the development: the form seeds its tender list from the
        // register once, and a scope change would otherwise leave a selection
        // naming another development's package.
        : <AwardContract key={project.id} p={project} packages={pk} />)}

      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-b">
            <Filters fields={[
              { label: 'Status', opts: ['All', 'In Progress', 'Completed'] },
              { label: 'Category', opts: ['All', 'Civil Works', 'MEP', 'Structure', 'Architectural', 'Consultancy'] },
              {
                label: 'Role',
                opts: ['All', 'Main Contractor', 'Trade Contractor', 'Supplier', 'PMC',
                  'Design Consultant', 'Verification Consultant'],
              },
            ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

            <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="cart" label="Packages" value={pk.length}
                sub={`${parties.length} counterparties`} tone="blue" />
              <KPI icon="check" label={<>Awarded Value <Info term="award-value" /></>} value={mn(awardedValue)}
                sub={`${pct(awardedValue, totals.budget)} of Budget`} tone="navy" />
              <KPI icon="check" label={<>Committed <Info term="committed" /></>} value={mn(committed)}
                sub={`${pct(committed, totals.budget)} of Budget`} tone="green" />
              <KPI icon="wallet" label={<>Paid to Date <Info term="paid" /></>} value={mn(paid)}
                sub={`${pct(paid, committed)} of Committed`} tone="amber" />
              <KPI icon="clock" label="Out to Tender" value={tendered.length}
                sub={tendered.length ? 'Estimated, not committed' : 'Every package is awarded'} tone="blue" />
            </div>

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={rowKey(x.id, x)}
                      className={`click${sel && rowKey(sel.id, sel) === rowKey(x.id, x) ? ' sel' : ''}`}
                      onClick={() => setSel(x)}>
                      {rolledUp && <td><span className="tid">{x.project}</span></td>}
                      <td><span className="tid">{x.id}</span></td>
                      <td>{x.name}</td>
                      <td>{x.wbs}</td>
                      <td>{x.contractor}</td>
                      <td><span className={`pill ${ROLE_TONE[x.role]}`}>{x.role}</span></td>
                      <td>{fmt(x.value)}</td>
                      <td>{x.awarded ? fmt(x.committed) : <span className="muted">—</span>}</td>
                      <td>{fmt(x.paid)}</td>
                      <td>{x.retention ? `${x.retention}%` : <span className="muted">none</span>}</td>
                      <td>{x.awarded ?? <span className="muted">tender</span>}</td>
                      <td><Badge status={x.status} /></td>
                      <td><Prog v={x.prog} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      No packages match the current filters.
                    </td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="tbl-total">
                    <td colSpan={rolledUp ? 6 : 5}>Awarded packages — reconciled to committed cost by control 7</td>
                    <td>{fmt(awardedValue)}</td>
                    <td>{fmt(committed)}</td>
                    <td>{fmt(paid)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {sel && (
          <Drawer
            title={sel.id}
            status={sel.status}
            tabs={['Overview', 'History']}
            onClose={() => setSel(null)}
          >
            {(tab) =>
              tab === 'History' ? (
                <AuditTimeline events={audit} />
              ) : (
                <div>
                  {kvGrid([
                    ['Contract / Scope', sel.name], ['WBS node', sel.wbs],
                    ['Category', sel.cat], ['Package Type', sel.type],
                    ['Contractor', sel.contractor], ['Engaged as', sel.role],
                    ['Awarded', sel.awarded ?? 'Out to tender'],
                    ['Award Value (SAR)', fmt(sel.value)],
                    ['Committed (SAR)', sel.awarded ? fmt(sel.committed) : 'Nothing committed'],
                    ['Paid to Date (SAR)', fmt(sel.paid)],
                    ['Paid of Committed', pct(sel.paid, sel.committed, 1)],
                    ['Retention in the payment terms', sel.retention ? `${sel.retention}%` : 'None'],
                    ['Progress', `${sel.prog}%`],
                  ])}
                  <div>
                    <div className="kv-l" style={{ marginBottom: 6 }}>Progress</div>
                    <Prog v={sel.prog} />
                  </div>
                  <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 14 }}>
                    The retention percentage above is the default a payment claim on this package
                    starts from. Terms differ between claims, so the claim decides the rate actually
                    withheld.
                  </p>
                </div>
              )}
          </Drawer>
        )}
      </div>

      {/* DRAWN DOWN AGAINST COMMITMENT — how much of what was promised to
          each package has actually left the account. A package near 100% is
          nearly settled; one at nought has been awarded and not yet invoiced.
          The number this answers is "where is the money", which no table of
          eleven columns answers at a glance. */}
      {awarded.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h3>Drawn Down Against Commitment</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {`${fmt(paidTotal)} of ${fmt(committedTotal)} SAR committed`}
            </span>
          </div>
          <div className="card-b">
            <HBars
              items={awarded.map((x) => ({
                label: x.name,
                v: x.committed ? Math.round((x.paid / x.committed) * 100) : 0,
                // Over its own commitment is the defect control 18 exists to
                // find, so it is painted as one rather than clipped to 100.
                color: x.paid > x.committed ? 'var(--red)'
                  : x.committed && x.paid / x.committed >= 0.9 ? 'var(--green)' : 'var(--blue)',
              }))}
              max={100}
              fmtV={(v) => `${v}%`}
            />
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              A package out to tender is not shown: nobody has been promised anything, so there is
              nothing to draw down against.
            </p>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>By counterparty</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {`${parties.length} organisations across ${pk.length} packages`}
          </span>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>{['Counterparty', 'Engaged as', 'Packages', 'Award Value (SAR)',
                  'Committed (SAR)', 'Paid to Date (SAR)', 'Paid of Committed'].map((x) => <th key={x}>{x}</th>)}</tr>
              </thead>
              <tbody>
                {parties.map((c) => (
                  <tr key={c.name}>
                    <td><b>{c.name}</b></td>
                    <td><span className={`pill ${ROLE_TONE[c.role]}`}>{c.role}</span></td>
                    <td>{c.packages}</td>
                    <td>{fmt(c.value)}</td>
                    <td>{fmt(c.committed)}</td>
                    <td>{fmt(c.paid)}</td>
                    <td><Prog v={c.committed ? Math.round((c.paid / c.committed) * 100) : 0} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="tbl-total">
                  <td colSpan={2}>Total</td>
                  <td>{pk.length}</td>
                  <td>{fmt(pk.reduce((a, x) => a + x.value, 0))}</td>
                  <td>{fmt(committed)}</td>
                  <td>{fmt(paid)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
