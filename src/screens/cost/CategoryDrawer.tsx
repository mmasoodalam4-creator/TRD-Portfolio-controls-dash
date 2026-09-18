import type { CostCategory } from '@/domain/types';
import { fmt } from '@/domain/format';
import { Drawer, kvGrid, HBars, Badge } from '@/components';
import type { ScopePosition } from '@/domain/position';

/**
 * One cost category in detail, with the same forecast formulas applied at
 * category level.
 *
 * A category is a slice of the owner's Approved Development Budget, so its
 * forecast answers the same question the project-level one does: what will this
 * part of the development finally cost.
 */
export function CategoryDrawer({ p, cat, onClose }: {
  p: ScopePosition;
  cat: CostCategory;
  onClose: () => void;
}) {
  const cpi = cat.actual ? cat.ev / cat.actual : 1;
  const remaining = cat.budget - cat.ev;
  const afcAtCpi = Math.round(cat.actual + (cpi ? remaining / cpi : remaining));
  const shareOfBudget = p.budget ? (cat.budget / p.budget) * 100 : 0;
  const uncommitted = cat.budget - cat.committed;

  return (
    <Drawer
      title={cat.cat}
      status={cat.status}
      tabs={['Position', 'Forecast', 'Coverage']}
      onClose={onClose}
      footer={[
        <button key={1} className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>,
      ]}
    >
      {(tab) =>
        tab === 'Position' ? (
          <div>
            {kvGrid([
              ['Approved Budget (SAR)', fmt(cat.budget)],
              ['Share of project budget', `${shareOfBudget.toFixed(1)}%`],
              ['Committed Cost (SAR)', fmt(cat.committed)],
              ['Uncommitted (SAR)', fmt(uncommitted)],
              ['Actual Cost (SAR)', fmt(cat.actual)],
              ['Earned Value (SAR)', fmt(cat.ev)],
              ['AFC (SAR)', fmt(cat.afc)],
              ['Budget Variance (SAR)', fmt(cat.varc), cat.varc >= 0 ? 'var(--green)' : 'var(--red)'],
            ])}
            <div style={{ marginTop: 4 }}>
              <div className="kv-l" style={{ marginBottom: 6 }}>Status</div>
              <Badge status={cat.status} />
            </div>
          </div>
        ) : tab === 'Forecast' ? (
          <div>
            {kvGrid([
              ['Cost Performance Index', cat.actual ? cpi.toFixed(3) : 'n/a — no cost incurred'],
              ['Remaining work (Budget − EV)', fmt(remaining)],
              ['AFC at achieved CPI', fmt(afcAtCpi)],
              ['AFC recorded', fmt(cat.afc)],
              ['Difference', fmt(afcAtCpi - cat.afc),
                afcAtCpi - cat.afc <= 0 ? 'var(--green)' : 'var(--red)'],
            ])}
            <div style={{ marginTop: 14 }}>
              <div className="kv-l" style={{ marginBottom: 8 }}>Budget · AFC · Forecast (SAR)</div>
              <HBars
                max={Math.max(cat.budget, cat.afc, afcAtCpi) * 1.05}
                fmtV={(v) => fmt(Math.round(v))}
                items={[
                  { label: 'Budget', v: cat.budget, color: '#0B2545' },
                  { label: 'AFC', v: cat.afc, color: '#C9A227' },
                  { label: 'At CPI', v: afcAtCpi, color: afcAtCpi <= cat.budget ? '#1E9E5A' : '#D24141' },
                ]}
              />
            </div>
          </div>
        ) : (
          <div>
            {kvGrid([
              ['Committed of budget', `${cat.budget ? Math.round((cat.committed / cat.budget) * 100) : 0}%`],
              ['Spent of committed', `${cat.committed ? Math.round((cat.actual / cat.committed) * 100) : 0}%`],
              ['Earned of budget', `${cat.budget ? Math.round((cat.ev / cat.budget) * 100) : 0}%`],
              ['Uncommitted balance', fmt(uncommitted)],
            ])}
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
              {uncommitted > 0
                ? `${fmt(uncommitted)} SAR of this category's Approved Budget is not yet committed to a contract.`
                : 'This category is fully committed to contract.'}
            </p>
          </div>
        )}
    </Drawer>
  );
}
