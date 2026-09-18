import type { StatusLabel } from '@/domain/types';
import { Ic } from '../icons';

type StepState = 'done' | 'rej' | 'wait';

/**
 * Approval route for a variation or change: Draft through PMO approval.
 * The owner's PMO is the approving authority — contractors submit, they do
 * not approve. `pmc` is the development's own consultant, not a fixed name.
 */
export function ApprovalTimeline({ status, pmc }: { status: StatusLabel; pmc: string }) {
  const steps: [string, string, StepState][] = [
    ['Draft', 'Site engineer', 'done'],
    ['Submitted', 'Project manager', 'done'],
    ['PMC review', pmc, 'done'],
    ['PMO review', 'PMO', status === 'Approved' ? 'done' : status === 'Rejected' ? 'rej' : 'wait'],
    ['Approved', 'PMO', status === 'Approved' ? 'done' : 'wait'],
  ];

  return (
    <div>
      {steps.map((s, i) => (
        <div key={i} className="row" style={{
          gap: 12, padding: '10px 0',
          borderBottom: i < steps.length - 1 ? '1px solid #eef1f6' : 'none',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: s[2] === 'done' ? 'var(--green-bg)' : s[2] === 'rej' ? 'var(--red-bg)' : '#eef1f6',
            color: s[2] === 'done' ? 'var(--green)' : s[2] === 'rej' ? 'var(--red)' : 'var(--muted)',
          }}>
            {s[2] === 'done' ? Ic('check', 14) : s[2] === 'rej' ? Ic('x', 14) : Ic('clock', 14)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{s[0]}</div>
            <div className="muted" style={{ fontSize: 11 }}>{s[1]}</div>
          </div>
          {s[2] === 'done' && <span className="muted" style={{ fontSize: 10.5 }}>✓</span>}
        </div>
      ))}
    </div>
  );
}

export interface AuditEvent {
  at: string;
  what: string;
  icon?: string;
}

/**
 * Audit trail. Every change to a record is attributable — the control the
 * integrity story rests on.
 *
 * Takes the REAL events. It used to show the same five fixture lines on every
 * record in every register, which for a system whose pitch is traceability
 * was the wrong thing to fake. A record with no recorded changes says so.
 */
export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) {
    return <p className="muted" style={{ fontSize: 12 }}>No changes have been recorded against this record.</p>;
  }
  return (
    <div>
      {events.map((e, i) => (
        <div key={i} className="row" style={{
          gap: 12, padding: '9px 0',
          borderBottom: i < events.length - 1 ? '1px solid #eef1f6' : 'none',
        }}>
          <div className="kpi-ic" style={{ width: 28, height: 28, background: '#E8EDF5' }}>
            {Ic(e.icon ?? 'edit', 14, '#13315C')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{e.what}</div>
            <div className="muted" style={{ fontSize: 10.5 }}>{e.at}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
