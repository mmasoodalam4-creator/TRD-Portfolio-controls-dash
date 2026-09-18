import { fmt, mn, pct } from '@/domain/format';
import { KPI, Badge, Prog, HBars } from '@/components';
import { toneColor, toneOfKpi } from './tabs';
import { rowKey, DEV_COLUMN } from '../shared';
import { isRollUp } from '@/domain/position';
import type { Scoped } from '@/domain/rollup';
import type { ProcurementPackage } from '@/domain/types';
import type { ScopePosition } from '@/domain/position';

const COLUMNS = ['Package', 'Category', 'Contractor / Supplier', 'Committed (SAR)',
  'Paid (SAR)', 'Outstanding (SAR)', 'Drawn', 'Status'];

/** A signed figure for a table: mn's "−" convention, at full precision. */
const signed = (n: number): string => (n < 0 ? `−${fmt(-n)}` : fmt(n));

/**
 * What the owner is contractually committed to, and how much of it has been
 * drawn down.
 *
 * Uncommitted budget is the part of the Approved Development Budget not yet
 * placed under contract — the owner's remaining room to act, not headroom in a
 * commercial sense.
 */
export function CommitmentsTab({ p, packages }: { p: ScopePosition; packages: Scoped<ProcurementPackage>[] }) {
  // At a roll-up the register is concatenated and PKG ids repeat on every
  // development, so the key must carry the development — keying on the id
  // alone rendered eight rows keyed "PR-001" — and the table has to say
  // whose each row is, the same as every other rolled-up register table.
  const rolledUp = isRollUp(p);
  const committed = packages.reduce((a, x) => a + x.committed, 0);
  const paid = packages.reduce((a, x) => a + x.paid, 0);
  const outstanding = committed - paid;
  const uncommitted = p.budget - committed;

  const byCategory = packages.reduce<Record<string, number>>((acc, x) => {
    acc[x.cat] = (acc[x.cat] ?? 0) + x.committed;
    return acc;
  }, {});
  const palette = ['#0B2545', '#2F6DD0', '#1E9E5A', '#C9A227', '#8b5cf6', '#6B7A90'];

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 16 }}>
        <KPI icon="cart" label="Packages" value={packages.length} sub="Under contract" tone="blue" />
        <KPI icon="check" label="Committed Cost (SAR)" value={mn(committed)} sub={`${pct(committed, p.budget)} of Budget`} tone="green" />
        <KPI icon="wallet" label="Drawn Down (SAR)" value={mn(paid)} sub={`${pct(paid, committed)} of committed`} tone="gold" />
        <KPI icon="coins" label="Outstanding (SAR)" value={mn(outstanding)}
          sub={outstanding < 0 ? 'Paid above committed' : 'Committed, not yet paid'}
          tone={outstanding < 0 ? 'red' : 'amber'} />
        <KPI icon="variance" label="Uncommitted (SAR)" value={mn(uncommitted)}
          sub={uncommitted < 0 ? 'Committed above Approved Budget' : 'Budget not yet contracted'}
          tone={toneOfKpi(uncommitted)} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16 }}>
        <div className="card">
          <div className="card-h"><h3>Commitments by Package</h3></div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead><tr>{[...(rolledUp ? [DEV_COLUMN] : []), ...COLUMNS].map((x) => <th key={x}>{x}</th>)}</tr></thead>
                <tbody>
                  {packages.map((x) => (
                    <tr key={rowKey(x.id, x)}>
                      {rolledUp && <td><span className="tid">{x.project}</span></td>}
                      <td><span className="tid">{x.id}</span> {x.name}</td>
                      <td><span className="pill b-blue">{x.cat}</span></td>
                      <td>{x.contractor}</td>
                      <td>{fmt(x.committed)}</td>
                      <td>{fmt(x.paid)}</td>
                      <td style={{ color: x.committed - x.paid < 0 ? 'var(--red)' : undefined }}>
                        {signed(x.committed - x.paid)}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <Prog v={x.committed ? Math.round((x.paid / x.committed) * 100) : 0} />
                      </td>
                      <td><Badge status={x.status} /></td>
                    </tr>
                  ))}
                  <tr className="tbl-total">
                    <td colSpan={rolledUp ? 4 : 3}>TOTAL</td>
                    <td>{fmt(committed)}</td>
                    <td>{fmt(paid)}</td>
                    <td style={{ color: outstanding < 0 ? 'var(--red)' : undefined }}>{signed(outstanding)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              {`Package commitments reconcile to the ${rolledUp ? "scope's" : "project's"} Committed Cost of ${fmt(p.committed)} SAR `
                + `and Payments Made of ${fmt(p.paid)} SAR.`}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Commitment by Category</h3></div>
          <div className="card-b">
            <HBars
              max={Math.max(1, ...Object.values(byCategory))}
              fmtV={(v) => mn(v)}
              items={Object.entries(byCategory).map(([label, v], i) => ({
                label,
                v,
                color: palette[i % palette.length],
              }))}
            />
            <div style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.6, color: toneColor(uncommitted) }}>
              {uncommitted < 0
                ? `Commitments exceed the Approved Development Budget by ${fmt(-uncommitted)} SAR.`
                : `${fmt(uncommitted)} SAR of the Approved Development Budget is not yet placed under `
                  + `contract.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
