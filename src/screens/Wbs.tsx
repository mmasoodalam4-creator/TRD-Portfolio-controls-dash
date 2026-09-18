import { useMemo, useState } from 'react';
import { fmt, idx, varianceTone } from '@/domain/format';
import { Badge, Prog, Ic, HBars } from '@/components';
import { useScope, useScopedRegisters } from '@/state/ScopeProvider';
import { ScopeBand, bandMetrics } from './shared';

const FIGURES = ['Budget (SAR)', 'Planned Value (PV)', 'Earned Value (EV)',
  'Actual Cost (AC)', 'Progress', 'SPI', 'CPI', 'Status'];
/** The first two headings name what the rows are: packages, or developments. */
const columnsFor = (rolledUp: boolean): string[] =>
  (rolledUp ? ['Development', 'Name', ...FIGURES] : ['WBS Code', 'WBS Name', ...FIGURES]);

const iconColor = (lvl: number) => (lvl === 0 ? '#2F6DD0' : lvl === 1 ? '#2F6DD0' : '#1E9E5A');

/**
 * Earned value by work package, indented by WBS level.
 *
 * The tree expands and collapses for real — a parent row hides its children —
 * and the search filters by code or name. Progress is EV ÷ budget for every
 * row, never a stored figure: four authored rows carried a percentage that
 * contradicted their own earned value.
 */
export function Wbs() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';
  // At a roll-up the breakdown is the DEVELOPMENTS, each contributing its own
  // level-0 position under one root — a portfolio is not made of work
  // packages. See `domain/rollup.ts`.
  const { wbs: rows } = useScopedRegisters();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  // Level 0 is the whole project, and is what the TOTAL row reports.
  const total = rows.find((r) => r.level === 0)
    ?? { budget: 0, pv: 0, ev: 0, ac: 0, prog: 0, spi: 1, cpi: 1 };
  const packages = rows.filter((r) => r.level === 1);
  const controlTotal = packages.reduce((t, r) => t + r.budget, 0);
  const reserve = total.budget - controlTotal;

  const parents = useMemo(() => new Set(
    rows.filter((r) => rows.some((o) => o.level > r.level && o.code.startsWith(`${r.code}.`))).map((r) => r.code),
  ), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))) return false;
      if (q) return true; // a search shows every match, whatever is collapsed
      // Hidden if any ancestor is collapsed.
      const parts = r.code.split('.');
      for (let i = 1; i < parts.length; i++) {
        if (collapsed.has(parts.slice(0, i).join('.'))) return false;
      }
      return true;
    });
  }, [rows, query, collapsed]);

  const toggle = (code: string) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['AFC (SAR)', fmt(pos.afc)],
        ['Budget Variance (SAR)', fmt(pos.budget - pos.afc),
          varianceTone(pos.budget - pos.afc) === 'red' ? 'var(--red)' : 'var(--green)'],
        ['Overall Progress', `${total.budget ? Math.round((total.ev / total.budget) * 100) : 0}%`],
      ])} />

      {/* PERFORMANCE BY PACKAGE — earned value against the budget it was
          earned from, one bar per level-1 package. The table below carries
          every figure; this says at a glance which package is behind, which is
          the question somebody opens this screen with. */}
      {packages.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h3>{rolledUp ? 'Earned Value by Development' : 'Earned Value by Package'}</h3>
            <span className="muted" style={{ fontSize: 11 }}>
              {rolledUp ? 'share of each development\u2019s own budget' : 'share of each package\u2019s own budget'}
            </span>
          </div>
          <div className="card-b">
            <HBars
              items={packages.map((n) => ({
                label: n.name,
                v: n.budget ? Math.round((n.ev / n.budget) * 100) : 0,
                color: n.budget && n.ev / n.budget >= 0.95 ? 'var(--green)'
                  : n.budget && n.ev / n.budget >= 0.75 ? 'var(--blue)' : 'var(--amber)',
              }))}
              max={100}
              fmtV={(v) => `${v}%`}
            />
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              {`${fmt(total.ev)} SAR earned against ${fmt(total.budget)} SAR of `}
              {rolledUp ? 'approved budget. A development' : 'package budget. A package'}
              {' at 100% has earned its whole budget; it has not necessarily been paid for.'}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-b">
          <div className="between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div className="search" style={{ maxWidth: 280 }}>
              <span className="si">{Ic('search', 16)}</span>
              <input aria-label="Search work packages" placeholder="Search WBS…" value={query}
                onChange={(e) => { setQuery(e.target.value); }} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost" style={{ padding: '8px 13px' }}
                disabled={collapsed.size === 0} onClick={() => { setCollapsed(new Set()); }}>Expand all</button>
              <button type="button" className="btn btn-ghost" style={{ padding: '8px 13px' }}
                disabled={collapsed.size === parents.size} onClick={() => { setCollapsed(new Set(parents)); }}>Collapse all</button>
            </div>
          </div>

          <div className="tbl-wrap">
            <table>
              <thead><tr>{columnsFor(rolledUp).map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {visible.map((r) => {
                  const isParent = parents.has(r.code);
                  const prog = r.budget ? Math.round((r.ev / r.budget) * 100) : 0;
                  return (
                    <tr key={r.code} className={isParent ? 'click' : ''}
                      onClick={isParent ? () => { toggle(r.code); } : undefined}
                      aria-expanded={isParent ? !collapsed.has(r.code) : undefined}>
                      <td>
                        <div className="row" style={{ gap: 8, paddingLeft: r.level * 16 }}>
                          {isParent
                            ? <span style={{ display: 'inline-flex', transform: collapsed.has(r.code) ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>{Ic('chevD', 13, '#9aa7bd')}</span>
                            : <span style={{ width: 13, display: 'inline-block' }} />}
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, background: `${iconColor(r.level)}22`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {Ic('wbs', 12, iconColor(r.level))}
                          </div>
                          <b style={{ color: 'var(--blue)' }}>{r.code}</b>
                        </div>
                      </td>
                      <td><span style={{ fontWeight: r.level === 0 ? 700 : r.level === 1 ? 600 : 400 }}>{r.name}</span></td>
                      <td>{fmt(r.budget)}</td>
                      <td>{fmt(r.pv)}</td>
                      <td>{fmt(r.ev)}</td>
                      <td>{fmt(r.ac)}</td>
                      <td><Prog v={prog} /></td>
                      <td><b style={{ color: r.spi >= 0.9 ? 'var(--green)' : r.spi >= 0.7 ? 'var(--amber)' : 'var(--red)' }}>{idx(r.spi)}</b></td>
                      <td><b style={{ color: r.cpi >= 0.95 ? 'var(--green)' : 'var(--amber)' }}>{idx(r.cpi)}</b></td>
                      <td><Badge status={r.status} /></td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={FIGURES.length + 2} className="muted">No work packages match.</td></tr>
                )}
                {/* The packages break down the CONTROL budget; the approved budget
                    above them carries a reserve. Shown so the arithmetic between the
                    package column and the total is visible rather than puzzling. */}
                {!query && reserve !== 0 && (
                  <tr>
                    <td />
                    <td className="muted">Reserve (approved − control)</td>
                    <td className="muted">{fmt(reserve)}</td>
                    <td colSpan={7} />
                  </tr>
                )}
                <tr className="tbl-total">
                  <td />
                  <td>Total (approved budget)</td>
                  <td>{fmt(total.budget)}</td>
                  <td>{fmt(total.pv)}</td>
                  <td>{fmt(total.ev)}</td>
                  <td>{fmt(total.ac)}</td>
                  <td>{`${total.budget ? Math.round((total.ev / total.budget) * 100) : 0}%`}</td>
                  <td>{idx(total.spi)}</td>
                  <td>{idx(total.cpi)}</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
