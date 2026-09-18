import { useState } from 'react';
import type { ChangeRequest } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { fmt, pct, varianceTone } from '@/domain/format';
import { KPI, Badge, Ic, Filters, applyFilters, Drawer, kvGrid, docList, AuditTimeline } from '@/components';
import { useScope, useScopedRegisters } from '@/state/ScopeProvider';
import { useAuditFor } from '@/state/DataProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';

const COLUMNS = ['CL No.', 'Change Title', 'Category', 'Submitted On', 'Impact',
  'Budget Impact (SAR)', 'Status', 'Actions'];

const TONE_COLOUR = { green: 'var(--green)', red: 'var(--red)', grey: 'var(--muted)' } as const;

/**
 * Change requests, upstream of variations.
 *
 * A change is recorded here before it becomes a contractor variation, which is
 * what lets the owner see cost impact before it is committed.
 */
export function ChangeLog() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';

  const { changes: cls } = useScopedRegisters();
  const [sel, setSel] = useState<Scoped<ChangeRequest> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // The trail of whichever development the open row belongs to.
  const audit = useAuditFor(sel?.project ?? scope.project);

  const ap = cls.filter((c) => c.status === 'Approved');
  const rv = cls.filter((c) => c.status === 'Under Review');
  const rj = cls.filter((c) => c.status === 'Rejected');
  const rows = applyFilters(cls, filters, { Status: 'status', Category: 'cat', Impact: 'impact' });

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['AFC (SAR)', fmt(pos.afc)],
        ['Budget Variance (SAR)', fmt(pos.budget - pos.afc),
          TONE_COLOUR[varianceTone(pos.budget - pos.afc)]],
      ])} />

      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-b">
            <Filters fields={[
              { label: 'Status', opts: ['All', 'Approved', 'Under Review', 'Rejected'] },
              { label: 'Category', opts: ['All', 'Site Condition', 'Design Change', 'Client Change'] },
              { label: 'Impact', opts: ['All', 'High', 'Medium', 'Low'] },
            ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

            <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="change" label="Total Changes" value={cls.length}
                sub={rolledUp ? 'In scope' : 'This development'} tone="blue" />
              <KPI icon="check" label="Approved" value={ap.length} sub={`${pct(ap.length, cls.length)} of total`} tone="green" />
              <KPI icon="clock" label="Under Review" value={rv.length} sub={`${pct(rv.length, cls.length)} of total`} tone="amber" />
              <KPI icon="x" label="Rejected" value={rj.length} sub={`${pct(rj.length, cls.length)} of total`} tone="red" />
            </div>

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={rowKey(c.no, c)}
                      className={`click${sel && rowKey(sel.no, sel) === rowKey(c.no, c) ? ' sel' : ''}`}
                      onClick={() => setSel(c)}>
                      {rolledUp && <td><span className="tid">{c.project}</span></td>}
                      <td><span className="tid">{c.no}</span></td>
                      <td>{c.title}</td>
                      <td>{c.cat}</td>
                      <td>{c.date}</td>
                      <td><Badge status={c.impact} /></td>
                      <td>{fmt(c.amount)}</td>
                      <td><Badge status={c.status} /></td>
                      <td>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Open ${c.no}`}
                          onClick={(e) => { e.stopPropagation(); setSel(c); }}>
                          {Ic('eye', 14)}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      No changes match the current filters.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {sel && (
          <Drawer
            title={sel.no}
            status={sel.status}
            tabs={['Details', 'Impact', ...(sel.docs.length ? ['Documents'] : []), 'History']}
            onClose={() => setSel(null)}
          >
            {(tab) =>
              tab === 'Details' ? (
                <div>
                  {kvGrid([
                    ...(sel.project ? [['Development', sel.project] as [string, string]] : []),
                    ['Change Title', sel.title], ['Category', sel.cat], ['Impact', sel.impact],
                    ['Submitted On', sel.date], ['Submitted By', sel.by],
                  ])}
                  <div style={{ marginBottom: 16 }}>
                    <div className="kv-l">Description</div>
                    <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>{sel.desc}</p>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div className="kv-l">Budget Impact (SAR)</div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{fmt(sel.amount)}</div>
                  </div>
                  {docList(sel.docs)}
                </div>
              ) : tab === 'History' ? (
                <AuditTimeline events={audit} />
              ) : tab === 'Documents' ? (
                docList(sel.docs)
              ) : (
                kvGrid([
                  ['Cost Impact (SAR)', fmt(sel.amount)],
                  ['Converts to VO', sel.status === 'Approved' ? 'Yes' : 'Pending'],
                ])
              )}
          </Drawer>
        )}
      </div>
    </div>
  );
}
