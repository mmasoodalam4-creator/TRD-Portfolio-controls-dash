import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CostCategory } from '@/domain/types';
import { fmt, pct } from '@/domain/format';
import { usePosition, useScopedRegisters } from '@/state/ScopeProvider';
import { useCorporate } from '@/state/DataProvider';
import { ScopeBand, bandMetrics } from '../shared';
import { COST_TABS, isCostTab, toneColor, type CostTabId } from './tabs';
import { CostSummary } from './CostSummary';
import { CostByCategory } from './CostByCategory';
import { MonthlyCostTab } from './MonthlyCost';
import { ForecastTab } from './ForecastTab';
import { CashFlowTab } from './CashFlow';
import { CommitmentsTab } from './Commitments';
import { CategoryDrawer } from './CategoryDrawer';

/**
 * Development cost control and forecast.
 *
 * Six tabs over one project's cost position. The active tab lives in the URL
 * alongside scope, so a specific view is a link — "#/cost?tab=forecast&…" opens
 * the forecast for a named development.
 *
 * Every figure on every tab is an owner-side cost. There is no revenue side to
 * this module by design.
 */
export function Cost({ canEdit = false }: { canEdit?: boolean }) {
  // The position in scope, and the registers of everything in it: at Project
  // level one development's, above it the roll-up. Cost categories fold onto
  // their own key and sum, so the table reads the same at every level and its
  // total is the one the band reports.
  const pos = usePosition();
  const { costCategories: cats, procurement } = useScopedRegisters();
  const { months, scurve } = useCorporate();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<CostCategory | null>(null);

  const raw = params.get('tab');
  const tab: CostTabId = isCostTab(raw) ? raw : 'summary';

  const setTab = (next: CostTabId) => {
    setParams((prev) => {
      const q = new URLSearchParams(prev);
      if (next === 'summary') q.delete('tab');
      else q.set('tab', next);
      return q;
    }, { replace: true });
    setSelected(null);
  };

  return (
    <div className="fade-up">
      <ScopeBand metrics={(band) => bandMetrics(band, [
        ['AFC (SAR)', fmt(band.afc)],
        ['Budget Variance (SAR)', fmt(band.budget - band.afc), toneColor(band.budget - band.afc)],
        ['Budget Variance %', pct(band.budget - band.afc, band.budget, 1),
          toneColor(band.budget - band.afc)],
      ])} />

      <div className="card">
        <div className="card-b">
          <div className="tabs">
            {COST_TABS.map((t) => (
              <button
                key={t.id}
                className={`tab${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'summary' && <CostSummary p={pos} cats={cats} months={months} scurve={scurve} onSelect={setSelected} />}
          {tab === 'category' && <CostByCategory p={pos} cats={cats} onSelect={setSelected} />}
          {tab === 'monthly' && <MonthlyCostTab p={pos} months={months} scurve={scurve} />}
          {tab === 'forecast' && <ForecastTab p={pos} />}
          {tab === 'cashflow' && <CashFlowTab p={pos} months={months} scurve={scurve} canEdit={canEdit} />}
          {tab === 'commitments' && <CommitmentsTab p={pos} packages={procurement} />}
        </div>
      </div>

      {selected && <CategoryDrawer p={pos} cat={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
