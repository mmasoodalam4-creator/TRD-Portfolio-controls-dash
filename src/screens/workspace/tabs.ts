import type { SeatCapabilities } from '@/domain/seats';
import type { PageId } from '@/app/types';

/**
 * THE MODULE TAB ROW.
 *
 * Every module of one development, along the top, in the order a person works
 * through them: what it is, what was reported, what it cost, what was
 * committed and paid, then the operational registers.
 *
 * Each entry names a routed screen. The workspace RENDERS THAT SCREEN — it
 * does not reimplement it. That is the whole design: one place a figure is
 * computed, shown twice (here inside a development, and in the sidebar where
 * it rolls up across a portfolio), rather than two implementations that drift.
 *
 * `needs` says which CAPABILITY opens a module, and mirrors NAV. It is not the
 * enforcement — the screen refuses on its own and the server refuses again —
 * but a tab whose every action is rejected teaches a person that the system
 * does not know who they are. A predicate over flags rather than a list of
 * seat names, for the reason NAV states: seats are rows an administrator
 * edits, and a list goes stale the moment one is defined.
 */
export interface WsModule {
  id: PageId;
  label: string;
  icon: string;
  needs?: (can: SeatCapabilities) => boolean;
}

export const WS_MODULES: WsModule[] = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'period', label: 'Monthly Reporting', icon: 'edit', needs: (c) => c.input || c.administer },
  { id: 'wbs', label: 'WBS', icon: 'wbs' },
  { id: 'cost', label: 'Cost & Financials', icon: 'cost' },
  { id: 'variations', label: 'Variations', icon: 'variations' },
  { id: 'change', label: 'Change Log', icon: 'change' },
  { id: 'procurement', label: 'Procurement', icon: 'procurement' },
  { id: 'claims', label: 'Payment Claims', icon: 'coins' },
  { id: 'manpower', label: 'Manpower', icon: 'manpower' },
  { id: 'equipment', label: 'Equipment', icon: 'equipment' },
  { id: 'quality', label: 'Quality', icon: 'quality' },
  { id: 'hse', label: 'HSE', icon: 'hse' },
  { id: 'risk', label: 'Risk', icon: 'risk' },
  { id: 'issues', label: 'Issues', icon: 'issues' },
  { id: 'documents', label: 'Documents', icon: 'documents' },
];

export const isWsModule = (v: string | null): v is PageId =>
  WS_MODULES.some((m) => m.id === v);

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
