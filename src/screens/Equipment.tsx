import { useState } from 'react';
import type { EquipmentItem } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { fmt, pct } from '@/domain/format';
import {
  KPI, Badge, Prog, Filters, applyFilters, Drawer, kvGrid, AuditTimeline, Donut, HBars,
} from '@/components';
import { countBy } from '@/components/charts/breakdown';
import { useScope, useScopedRegisters } from '@/state/ScopeProvider';
import { useAuditFor } from '@/state/DataProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';
import { SubTabs, useSubTab } from './subtabs';

const COLUMNS = ['Eq. ID', 'Equipment Name', 'Category', 'Type', 'Brand / Model', 'Location', 'Status', 'Utilisation'];

/** Distinct values of one field, in register order, for a filter. */
const options = <T,>(rows: T[], pick: (r: T) => string): string[] =>
  ['All', ...Array.from(new Set(rows.map(pick)))];

/**
 * Plant deployment and utilisation.
 *
 * Availability and utilisation percentages only — no hire rates, no equipment
 * cost. The owner tracks whether plant is working, not what it bills.
 */
export function Equipment() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';

  const { equipment: eq, maintenance: maintenanceJobs } = useScopedRegisters();
  const [view, setView] = useSubTab(['Register', 'Maintenance'] as const);
  const [sel, setSel] = useState<Scoped<EquipmentItem> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // The trail of whichever development the open machine belongs to.
  const audit = useAuditFor(sel?.project ?? scope.project);

  const rows = applyFilters(eq, filters, { Status: 'status', Category: 'cat', Type: 'type', Location: 'loc' });

  // Derived from the register rather than fixed. These counts used to be
  // literals that stayed at 156/132/12/12 whichever development was selected,
  // while the table beneath them changed.
  const operating = eq.filter((e) => e.status === 'Operating').length;
  const maintenance = eq.filter((e) => e.status === 'Under Maintenance').length;
  const outOfService = eq.filter((e) => e.status === 'Out of Service').length;
  const avgUtil = eq.length ? Math.round(eq.reduce((a, e) => a + e.util, 0) / eq.length) : 0;

  // Utilisation per category, WEIGHTED BY THE UNITS IN IT. A flat average
  // across categories lets one idle generator count for as much as forty
  // pieces of access equipment, which is how a fleet report comes to disagree
  // with the fleet.
  const byCategory = [...eq.reduce((m, e) => {
    const row = m.get(e.cat) ?? { units: 0, util: 0 };
    return m.set(e.cat, { units: row.units + 1, util: row.util + e.util });
  }, new Map<string, { units: number; util: number }>())]
    .map(([cat, r]) => ({ cat, units: r.units, util: Math.round(r.util / r.units) }))
    .sort((a, b) => b.util - a.util);

  const byStatus = countBy(eq, (e) => String(e.status));

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Committed Cost (SAR)', fmt(pos.committed)],
        ['Equipment Count', String(eq.length)],
        ['Operating', String(operating), 'var(--green)'],
        ['Under Maintenance', String(maintenance), 'var(--amber)'],
        ['Out of Service', String(outOfService), 'var(--red)'],
      ])} />

      <SubTabs
        tabs={['Register', 'Maintenance'] as const}
        active={view}
        onSelect={setView}
        counts={{ Register: eq.length, Maintenance: maintenanceJobs.length }}
      />

      {view === 'Maintenance' ? (
        <div className="card">
          <div className="card-h">
            <h3>Maintenance</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>what is down, for how long and who has it</span>
          </div>
          <div className="card-b">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{[...(rolledUp ? [DEV_COLUMN] : []), 'Eq. ID', 'Equipment', 'Work',
                    'Last service', 'Next due', 'Status',
                    'Carried out by'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {maintenanceJobs.map((m) => (
                    <tr key={rowKey(m.equipmentId, m)}>
                      {rolledUp && <td><span className="tid">{m.project}</span></td>}
                      <td><span className="tid">{m.equipmentId}</span></td>
                      <td><b>{m.equipment}</b></td>
                      <td>{m.work}</td>
                      <td>{m.lastService}</td>
                      <td>{m.nextDue}</td>
                      <td><Badge status={m.status} /></td>
                      <td>{m.provider}</td>
                    </tr>
                  ))}
                  {maintenanceJobs.length === 0 && (
                    <tr><td colSpan={rolledUp ? 8 : 7} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      Every machine {rolledUp ? 'in this scope' : 'on this development'} is operating above 70% utilisation, so
                      none is scheduled for attention.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
              No cost sits on a maintenance record. This system holds no equipment rates, so the
              register answers availability and nothing about money.
            </p>
          </div>
        </div>
      ) : (
      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="equipment" label="Total Equipment" value={eq.length} sub={rolledUp ? 'In scope' : 'On this development'} tone="blue" />
              <KPI icon="equipment" label="Operating" value={operating} sub={`${pct(operating, eq.length, 1)} of total`} tone="green" />
              <KPI icon="settings" label="Under Maintenance" value={maintenance} sub={`${pct(maintenance, eq.length, 1)} of total`} tone="amber" />
              <KPI icon="x" label="Out of Service" value={outOfService} sub={`${pct(outOfService, eq.length, 1)} of total`} tone="red" />
              <KPI icon="gauge" label="Avg. Utilisation" value={`${avgUtil}%`} sub="Across the fleet" tone="navy" />
            </div>

            {eq.length > 0 && (
              <div
                className="grid"
                style={{ gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}
              >
                <div className="card">
                  <div className="card-h">
                    <h3>Utilisation by Category</h3>
                    <span className="muted" style={{ fontSize: 11 }}>
                      weighted by the units in each
                    </span>
                  </div>
                  <div className="card-b">
                    <HBars
                      items={byCategory.map((c) => ({
                        label: `${c.cat} (${c.units})`,
                        v: c.util,
                        color: c.util >= 60 ? 'var(--green)' : c.util >= 40 ? 'var(--blue)' : 'var(--amber)',
                      }))}
                      max={100}
                      fmtV={(v) => `${v}%`}
                    />
                    <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
                      Availability and utilisation only. No rate is held against a machine on this
                      system — cost reaches the position through packages, certificates and claims.
                    </p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-h"><h3>Fleet by Status</h3></div>
                  <div className="card-b" style={{ display: 'flex', justifyContent: 'center' }}>
                    <Donut data={byStatus} total={String(eq.length)} label="units" size={140} />
                  </div>
                </div>
              </div>
            )}

            <Filters fields={[
              { label: 'Status', opts: options(eq, (e) => e.status) },
              { label: 'Category', opts: options(eq, (e) => e.cat) },
              { label: 'Type', opts: options(eq, (e) => e.type) },
              { label: 'Location', opts: options(eq, (e) => e.loc) },
            ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={rowKey(e.id, e)}
                      className={`click${sel && rowKey(sel.id, sel) === rowKey(e.id, e) ? ' sel' : ''}`}
                      onClick={() => setSel(e)}>
                      {rolledUp && <td><span className="tid">{e.project}</span></td>}
                      <td><span className="tid">{e.id}</span></td>
                      <td>{e.name}</td>
                      <td><span className="pill b-blue">{e.cat}</span></td>
                      <td>{e.type}</td>
                      <td>{e.model}</td>
                      <td>{e.loc}</td>
                      <td><Badge status={e.status} /></td>
                      <td><Prog v={e.util} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      {eq.length === 0
                        ? (rolledUp ? 'No plant is recorded in this scope.' : 'No plant is recorded for this development.')
                        : 'No equipment matches the current filters.'}
                    </td></tr>
                  )}
                </tbody>
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
                    ['Equipment Name', sel.name], ['Model', sel.model], ['Category', sel.cat],
                    ['Type', sel.type], ['Location', sel.loc], ['Status', sel.status],
                    ['Utilisation', `${sel.util}%`],
                  ])}
                  <div>
                    <div className="kv-l" style={{ marginBottom: 6 }}>Utilisation</div>
                    <Prog v={sel.util} />
                  </div>
                </div>
              )}
          </Drawer>
        )}
      </div>
      )}
    </div>
  );
}
