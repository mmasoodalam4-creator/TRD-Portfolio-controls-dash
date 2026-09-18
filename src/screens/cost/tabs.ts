import { varianceTone } from '@/domain/format';
import type { KpiTone } from '@/components';

/** The six Cost & Financials tabs, in order. Tab lives in the URL so a view is linkable. */
export const COST_TABS = [
  { id: 'summary', label: 'Cost Summary' },
  { id: 'category', label: 'Cost by Category' },
  { id: 'monthly', label: 'Monthly Cost' },
  { id: 'forecast', label: 'Forecast (AFC)' },
  { id: 'cashflow', label: 'Cash Flow' },
  { id: 'commitments', label: 'Commitments' },
] as const;

export type CostTabId = typeof COST_TABS[number]['id'];

export const isCostTab = (v: string | null): v is CostTabId =>
  COST_TABS.some((t) => t.id === v);

/**
 * The colour a variance takes, by sign. Every tab used to paint a variance
 * green unconditionally — true of every fixture, and of no overrun.
 */
const TONE_COLOR: Record<ReturnType<typeof varianceTone>, string> = {
  green: 'var(--green)', red: 'var(--red)', grey: 'var(--muted)',
};
export const toneColor = (v: number): string => TONE_COLOR[varianceTone(v)];

/** The same tone as a KPI tile tone. A zero variance is neutral, so navy. */
export const toneOfKpi = (v: number): KpiTone => {
  const t = varianceTone(v);
  return t === 'grey' ? 'navy' : t;
};
