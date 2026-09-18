import { useState } from 'react';
import type { Variation } from '@/domain/types';
import type { Scoped } from '@/domain/rollup';
import { fmt, mn, pct, varianceTone } from '@/domain/format';
import {
  KPI, Badge, Ic, Filters, applyFilters, Drawer, kvGrid, docList, ApprovalTimeline, AuditTimeline, toast, toastError,
} from '@/components';
import { useScope, useScopedRegisters } from '@/state/ScopeProvider';
import { useMutations, useAuditFor, useProjects, type AuditEvent } from '@/state/DataProvider';
import { useAuth } from '@/state/AuthProvider';
import { ScopeBand, bandMetrics, rowKey, DEV_COLUMN } from './shared';

const COLUMNS = ['VO No', 'Title / Description', 'Type', 'Category', 'Submitted On', 'Impact',
  'Amount (SAR)', 'Status', 'Actions'];

const TONE_COLOUR = { green: 'var(--green)', red: 'var(--red)', grey: 'var(--muted)' } as const;

/**
 * Contractor variation orders and their budget impact.
 *
 * A variation increases the owner's cost commitment. Amounts here are
 * additions to the Approved Development Budget's consumption, never income.
 */
export function Variations() {
  const { scope } = useScope();
  const rolledUp = scope.level !== 'Project';
  const projects = useProjects();
  const { account, authRequired } = useAuth();
  const canApproveVariation = !authRequired || account?.role === 'approver' || account?.role === 'admin';

  const { variations: vos } = useScopedRegisters();
  const [sel, setSel] = useState<Scoped<Variation> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // A variation belongs to ONE development, whatever is in scope — the row
  // says which, and that is the development the approval is filed against.
  const owner = sel?.project ?? scope.project;
  const audit = useAuditFor(owner);

  const approved = vos.filter((v) => v.status === 'Approved');
  const review = vos.filter((v) => v.status === 'Under Review');
  const rej = vos.filter((v) => v.status === 'Rejected');
  const rows = applyFilters(vos, filters, { Status: 'status', Type: 'type', Impact: 'impact' });

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
              { label: 'Type', opts: ['All', 'Client Change', 'Consultant Change', 'Site Condition', 'Design Change'] },
              { label: 'Impact', opts: ['All', 'High', 'Medium', 'Low'] },
            ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

            <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 14 }}>
              <KPI icon="variations" label="Total Variations" value={vos.length}
                sub={rolledUp ? 'In scope' : 'This development'} tone="blue" />
              <KPI icon="check" label="Total Approved" value={approved.length} sub={`${pct(approved.length, vos.length)} of total`} tone="green" />
              <KPI icon="trendUp" label="Approved Amount" value={mn(approved.reduce((a, v) => a + v.amount, 0))} sub="SAR" tone="green" />
              <KPI icon="clock" label="Under Review" value={review.length} sub={`${pct(review.length, vos.length)} of total`} tone="amber" />
              <KPI icon="x" label="Rejected" value={rej.length} sub={`${pct(rej.length, vos.length)} of total`} tone="red" />
            </div>

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {(rolledUp ? [DEV_COLUMN, ...COLUMNS] : COLUMNS).map((x) => <th key={x}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={rowKey(v.no, v)}
                      className={`click${sel && rowKey(sel.no, sel) === rowKey(v.no, v) ? ' sel' : ''}`}
                      onClick={() => setSel(v)}>
                      {rolledUp && <td><span className="tid">{v.project}</span></td>}
                      <td><span className="tid">{v.no}</span></td>
                      <td>{v.title}</td>
                      <td>{v.type}</td>
                      <td>{v.cat}</td>
                      <td>{v.date}</td>
                      <td><Badge status={v.impact} /></td>
                      <td>{fmt(v.amount)}</td>
                      <td><Badge status={v.status} /></td>
                      <td>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Open ${v.no}`}
                          onClick={(e) => { e.stopPropagation(); setSel(v); }}>
                          {Ic('eye', 14)}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (rolledUp ? 1 : 0)} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                      No variations match the current filters.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {sel && (
          <VODrawer
            v={sel}
            projectId={owner}
            pmc={projects.find((x) => x.id === owner)?.pmc ?? '—'}
            audit={audit}
            canApprove={canApproveVariation}
            onClose={() => setSel(null)}
            onApproved={() => setSel(null)}
          />
        )}
      </div>
    </div>
  );
}

function VODrawer({ v, projectId, pmc, audit, canApprove, onClose, onApproved }: {
  v: Variation;
  projectId: string;
  pmc: string;
  audit: AuditEvent[];
  canApprove: boolean;
  onClose: () => void;
  onApproved: () => void;
}) {
  const { commit } = useMutations();
  const [busy, setBusy] = useState(false);
  const pending = v.status === 'Under Review';

  const approve = () => {
    setBusy(true);
    void commit({
      kind: 'variation:approve', at: new Date().toISOString(), projectId, no: v.no,
    }).then(() => {
      // Approval changes the variation's STATUS. It does not move committed
      // cost — that follows from the next reporting period — and the toast
      // used to say it did.
      toast('Variation approved', `${v.no} is now approved; committed cost follows the next period`);
      onApproved();
    })
      .catch((err: unknown) => { toastError(err, 'The variation was not approved'); })
      .finally(() => { setBusy(false); });
  };

  // Only tabs with something behind them. Documents is listed when the
  // record carries attachments; an empty tab is a promise the screen cannot keep.
  const tabs = ['Details', 'Impact', ...(v.docs.length ? ['Documents'] : []), 'Approval', 'History'];

  return (
    <Drawer
      title={v.no}
      status={v.status}
      tabs={tabs}
      onClose={onClose}
      footer={pending && canApprove ? [
        <button key={2} className="btn btn-gold" style={{ flex: 1 }} onClick={approve} disabled={busy}>
          {Ic('check', 15)}{busy ? 'Approving…' : 'Approve'}
        </button>,
      ] : undefined}
    >
      {(tab) =>
        tab === 'Details' ? (
          <div>
            {kvGrid([
              ['Variation Title', v.title], ['Variation Type', v.type], ['Category', v.cat],
              ['Submitted On', v.date], ['Submitted By', v.by], ['Impact', v.impact],
              ['Amount (SAR)', fmt(v.amount)],
            ])}
            <div style={{ marginBottom: 16 }}>
              <div className="kv-l">Description</div>
              <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>{v.desc}</p>
            </div>
            {docList(v.docs)}
          </div>
        ) : tab === 'Documents' ? (
          docList(v.docs)
        ) : tab === 'Approval' ? (
          <ApprovalTimeline status={v.status} pmc={pmc} />
        ) : tab === 'History' ? (
          <AuditTimeline events={audit} />
        ) : (
          <div>
            {kvGrid([
              ['Cost Impact (SAR)', fmt(v.amount)],
              ['Impact', v.impact],
              ['Budget Effect', v.status === 'Approved' ? 'Applied at next period' : 'Pending approval'],
            ])}
          </div>
        )}
    </Drawer>
  );
}
