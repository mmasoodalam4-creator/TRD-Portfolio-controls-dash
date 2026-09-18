import { useState } from 'react';
import type { Issue } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { fmt, mn } from '@/domain/format';
import { KPI, Badge, Filters, applyFilters, Drawer, kvGrid, AuditTimeline } from '@/components';
import { isOpenIssue } from '@/domain/counts';
import { useScope, useScopedRegisters } from '@/state/ScopeProvider';
import { useAuditFor } from '@/state/DataProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';

const COLUMNS = ['Issue ID', 'Description', 'Priority', 'Owner', 'Open Date',
  'Cost Impact (SAR)', 'Ageing (days)', 'Status'];

/**
 * Live issues and escalations. Cost Impact is the owner's exposure where it
 * has been quantified.
 */
export function Issues() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';

  const { issues: iss } = useScopedRegisters();
  const [sel, setSel] = useState<Scoped<Issue> | null>(null);
  // The trail of whichever development the open row belongs to.
  const audit = useAuditFor(sel?.project ?? scope.project);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const rows = applyFilters(iss, filters, { Status: 'status', Priority: 'priority' });

  return (
    <div className="fade-up">
      <ScopeBand metrics={(pos) => bandMetrics(pos, [
        ['Open Issues', iss.filter(isOpenIssue).length],
        ['Critical', iss.filter((i) => i.priority === 'Critical').length, 'var(--red)'],
        ['Escalated', iss.filter((i) => i.status === 'Escalated').length, 'var(--amber)'],
      ])} />

      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-b">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="issues" label="Open Issues" value={iss.filter(isOpenIssue).length} sub="Active" tone="blue" />
              <KPI icon="alert" label="Critical" value={iss.filter((i) => i.priority === 'Critical').length} sub="Needs attention" tone="red" />
              <KPI icon="clock" label="Aged > 30 days" value={iss.filter((i) => i.days > 30).length} sub="Overdue" tone="amber" />
              <KPI icon="variance" label="Cost Impact" value={mn(iss.reduce((a, i) => a + i.cost, 0))} sub="Total" tone="navy" />
            </div>

            <Filters fields={[
              { label: 'Status', opts: ['All', 'Open', 'In Progress', 'Escalated', 'Closed'] },
              { label: 'Priority', opts: ['All', 'Critical', 'High', 'Medium', 'Low'] },
            ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={rowKey(i.id, i)}
                      className={`click${sel && rowKey(sel.id, sel) === rowKey(i.id, i) ? ' sel' : ''}`}
                      onClick={() => setSel(i)}>
                      {rolledUp && <td><span className="tid">{i.project}</span></td>}
                      <td><span className="tid">{i.id}</span></td>
                      <td>{i.desc}</td>
                      <td><Badge status={i.priority} /></td>
                      <td>{i.owner}</td>
                      <td>{i.opened}</td>
                      <td>{i.cost ? fmt(i.cost) : '-'}</td>
                      <td><span style={i.days > 30 ? { color: 'var(--red)', fontWeight: 600 } : {}}>{i.days}</span></td>
                      <td><Badge status={i.status} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      No issues match the current filters.
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
            tabs={['Details', 'History']}
            onClose={() => setSel(null)}
          >
            {(tab) =>
              tab === 'History' ? (
                <AuditTimeline events={audit} />
              ) : (
                kvGrid([
                  ...(sel.project ? [['Development', sel.project] as [string, string]] : []),
                  ['Description', sel.desc], ['Priority', sel.priority], ['Owner', sel.owner],
                  ['Open Date', sel.opened], ['Cost Impact', sel.cost ? fmt(sel.cost) : 'None'],
                  ['Ageing', `${sel.days} days`], ['Status', sel.status],
                ])
              )}
          </Drawer>
        )}
      </div>
    </div>
  );
}
