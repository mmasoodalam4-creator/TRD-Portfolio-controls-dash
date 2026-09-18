import { useState } from 'react';
import type { Project } from '@/domain/types';
import { fmt } from '@/domain/format';
import { useMutations } from '@/state/DataProvider';
import { Ic, toast, toastError } from '@/components';

/** "48,500,000" or "48500000" → 48500000; NaN otherwise. */
const parseMoney = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
};

/**
 * Record a payment certificate against the development.
 *
 * A certificate moves what has been certified and what has been paid (net of
 * retention). It does not move earned value or actual cost — those come from
 * the reporting period — and the server refuses a certificate that would
 * take certified value above the cost incurred (control 15), so a period
 * covering the work has to be reported before the certificate for it.
 *
 * This is the platform's way to record a certificate: document extraction is
 * scripted in the demonstration and deliberately unavailable where a real
 * register sits behind the screen.
 */
export function RecordCertificate({ p }: { p: Project }) {
  const { commit } = useMutations();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [certified, setCertified] = useState('');
  const [retention, setRetention] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const certifiedValue = parseMoney(certified);
  const retentionValue = retention.trim() ? parseMoney(retention) : 0;
  const headroom = p.actual - p.ipcSubmitted;

  const problems: Record<string, string> = {};
  if (!reference.trim()) problems.reference = 'A certificate reference is required (e.g. IPC-09)';
  else if (reference.trim().length > 40) problems.reference = 'At most 40 characters';
  if (!certified.trim()) problems.certified = 'Enter the gross certified value in SAR';
  else if (!Number.isFinite(certifiedValue) || certifiedValue <= 0) problems.certified = 'Whole riyals, digits only';
  else if (certifiedValue > headroom) problems.certified = `Exceeds cost incurred: only ${fmt(Math.max(0, headroom))} SAR of actual cost is not yet certified`;
  if (retention.trim() && (!Number.isFinite(retentionValue) || retentionValue < 0)) problems.retention = 'Whole riyals, digits only';
  else if (Number.isFinite(certifiedValue) && retentionValue > certifiedValue) problems.retention = 'Retention cannot exceed the certified value';
  const valid = Object.keys(problems).length === 0;

  const reset = () => { setReference(''); setCertified(''); setRetention(''); setTried(false); };

  const submit = () => {
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    commit({
      kind: 'ipc',
      at: new Date().toISOString(),
      projectId: p.id,
      certified: certifiedValue,
      retention: retentionValue,
      reference: reference.trim(),
    }).then(() => {
      toast('Certificate recorded', `${reference.trim()} · ${fmt(certifiedValue)} SAR certified, ${fmt(certifiedValue - retentionValue)} SAR paid`);
      reset();
      setOpen(false);
    }).catch((err: unknown) => {
      toastError(err, 'Certificate refused');
    }).finally(() => { setBusy(false); });
  };

  const error = (key: string) => (tried && problems[key]
    ? <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{problems[key]}</div>
    : null);

  if (!open) {
    return (
      <div className="between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {`${fmt(p.ipcSubmitted)} SAR certified against ${fmt(p.actual)} SAR incurred`}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setOpen(true); }}>
          {Ic('plus', 15)}Record certificate
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
      <form className="card-b" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 14 }}>{`Record a payment certificate for ${p.id}`}</h3>
          <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Cancel"
            onClick={() => { reset(); setOpen(false); }}>{Ic('x', 15)}</button>
        </div>
        <div className="form-row" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="ipc-ref">Certificate reference</label>
            <input id="ipc-ref" placeholder="e.g. IPC-09" value={reference} autoFocus
              onChange={(e) => setReference(e.target.value)} />
            {error('reference')}
          </div>
          <div className="form-field">
            <label htmlFor="ipc-certified">Gross certified (SAR)</label>
            <input id="ipc-certified" placeholder="e.g. 48,500,000" inputMode="numeric" value={certified}
              onChange={(e) => setCertified(e.target.value)} />
            {error('certified')}
          </div>
          <div className="form-field">
            <label htmlFor="ipc-retention">Retention withheld (SAR)</label>
            <input id="ipc-retention" placeholder="0" inputMode="numeric" value={retention}
              onChange={(e) => setRetention(e.target.value)} />
            {error('retention')}
          </div>
        </div>
        <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 620 }}>
            Certified value moves to certified to date and the net of retention to payments made.
            Earned value and actual cost are reported through Period Entry, so the period covering
            this work is filed first; a certificate above the cost incurred is refused.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { reset(); setOpen(false); }}>Cancel</button>
            <button type="submit" className="btn btn-gold" disabled={busy}>
              {Ic('check', 15)}{busy ? 'Recording…' : 'Record certificate'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
