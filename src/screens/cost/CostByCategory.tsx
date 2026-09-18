import type { CostCategory } from '@/domain/types';
import { fmt, mn, pct } from '@/domain/format';
import { Badge, Prog, Donut, Ic } from '@/components';
import { toneColor } from './tabs';
import type { ScopePosition } from '@/domain/position';

const COLUMNS = ['#', 'Cost Category', 'Approved Budget', 'Committed', 'Actual (AC)', 'Earned (EV)',
  'AFC', 'Variance', 'Var %', 'Commit %', 'Status', ''];

const SLICE_COLORS = ['#0B2545', '#2F6DD0', '#1E9E5A', '#C9A227', '#8b5cf6', '#6B7A90'];

/** A signed figure for a table: mn's "−" convention, at full precision. */
const signed = (n: number): string => (n < 0 ? `−${fmt(-n)}` : fmt(n));

/** Cost categories in full, with the composition of the budget beside them. */
export function CostByCategory({ p, cats, onSelect }: {
  p: ScopePosition;
  cats: CostCategory[];
  onSelect: (c: CostCategory) => void;
}) {
  const tot = cats.reduce(
    (a, c) => ({
      budget: a.budget + c.budget, committed: a.committed + c.committed,
      actual: a.actual + c.actual, ev: a.ev + c.ev, afc: a.afc + c.afc, varc: a.varc + c.varc,
    }),
    { budget: 0, committed: 0, actual: 0, ev: 0, afc: 0, varc: 0 },
  );

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 16 }}>
        <div className="card">
          <div className="card-h">
            <h3>Cost Categories</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>Select a category for its forecast</span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
                <tbody>
                  {cats.map((c, i) => (
                    <tr key={i} className="click" onClick={() => onSelect(c)}>
                      <td>{i + 1}</td>
                      <td><b>{c.cat}</b></td>
                      <td>{fmt(c.budget)}</td>
                      <td>{c.committed ? fmt(c.committed) : '-'}</td>
                      <td>{c.actual ? fmt(c.actual) : '-'}</td>
                      <td>{fmt(c.ev)}</td>
                      <td>{fmt(c.afc)}</td>
                      <td>
                        <span style={{ color: toneColor(c.varc), fontWeight: 600 }}>
                          {signed(c.varc)}
                        </span>
                      </td>
                      <td style={{ color: toneColor(c.varc) }}>{`${c.varpct}%`}</td>
                      <td style={{ minWidth: 110 }}>
                        <Prog v={c.budget ? Math.round((c.committed / c.budget) * 100) : 0} />
                      </td>
                      <td><Badge status={c.status} /></td>
                      <td>{Ic('chevR', 14, '#9aa7bd')}</td>
                    </tr>
                  ))}
                  <tr className="tbl-total">
                    <td />
                    <td>TOTAL</td>
                    <td>{fmt(tot.budget)}</td>
                    <td>{fmt(tot.committed)}</td>
                    <td>{fmt(tot.actual)}</td>
                    <td>{fmt(tot.ev)}</td>
                    <td>{fmt(tot.afc)}</td>
                    <td><span style={{ color: toneColor(tot.varc) }}>{signed(tot.varc)}</span></td>
                    <td style={{ color: toneColor(tot.varc) }}>{pct(tot.varc, tot.budget, 1)}</td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              {`Category totals reconcile to the project: Approved Budget ${fmt(p.budget)}, `
                + `Committed ${fmt(p.committed)}, Actual ${fmt(p.actual)}, AFC ${fmt(p.afc)}.`}
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-h"><h3>Budget Composition</h3></div>
            <div className="card-b">
              <Donut
                size={160}
                total={mn(tot.budget)}
                label="Approved Budget"
                data={cats.map((c, i) => ({
                  name: c.cat, v: c.budget, c: SLICE_COLORS[i % SLICE_COLORS.length],
                }))}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h3>Commitment Coverage</h3></div>
            <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cats.map((c, i) => (
                <div key={i}>
                  <div className="between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{c.cat}</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {`${fmt(c.committed)} of ${fmt(c.budget)}`}
                    </span>
                  </div>
                  <Prog v={c.budget ? Math.round((c.committed / c.budget) * 100) : 0} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
