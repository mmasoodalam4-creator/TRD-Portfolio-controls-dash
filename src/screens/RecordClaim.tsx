import { useState } from 'react';
import type { ProcurementPackage, Project } from '@/domain/types';
import { fmt } from '@/domain/format';
import { retentionOf } from '@/domain/calc';
import { useMutations } from '@/state/DataProvider';
import { Ic, toast, toastError } from '@/components';

/** "48,500,000" or "48500000" → 48500000; NaN otherwise. */
const parseMoney = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
};

const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Record an approved payment claim.
 *
 * The whole act in one form, because it is one act: the contractor claimed,
 * the consultant verified, and Tazayud approved. The verification is entered
 * as a fact — who, when, against what reference, for how much — because the
 * consultant holds no account in this system.
 *
 * The retention AMOUNT is never typed. It is the rate applied to the approved
 * figure, shown live, so the two cannot be entered inconsistently with each
 * other. The rate itself defaults from the package's payment terms and is
 * editable on every claim, which is the whole point of holding it per claim.
 *
 * Recording a claim carries an approval, so the server allows it only to the
 * approver and the administrator, and refuses one that would take certified
 * value above the cost incurred — control 15. The period covering the work is
 * filed first.
 */
export function RecordClaim({ p, packages }: { p: Project; packages: readonly ProcurementPackage[] }) {
  const { commit } = useMutations();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const awarded = packages.filter((x) => x.awarded !== null);
  const [packageId, setPackageId] = useState(awarded[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [milestone, setMilestone] = useState('');
  const [claimed, setClaimed] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [verifiedOn, setVerifiedOn] = useState('');
  const [verifiedRef, setVerifiedRef] = useState('');
  const [verified, setVerified] = useState('');
  const [approved, setApproved] = useState('');
  const [rate, setRate] = useState('');

  const chosen = awarded.find((x) => x.id === packageId);
  // The rate follows the chosen package until somebody overrides it.
  const rateValue = rate.trim() ? Number(rate) : (chosen?.retention ?? 0);
  const claimedValue = parseMoney(claimed);
  const verifiedValue = parseMoney(verified);
  const approvedValue = parseMoney(approved);
  const retention = Number.isFinite(approvedValue) ? retentionOf(approvedValue, rateValue) : 0;
  const net = Number.isFinite(approvedValue) ? Math.max(0, approvedValue - retention) : 0;
  const headroom = p.actual - p.ipcSubmitted;

  const problems: Record<string, string> = {};
  if (!packageId) problems.packageId = 'Choose the package claimed against';
  if (!reference.trim()) problems.reference = 'A claim reference is required (e.g. PC-2026-049)';
  if (!milestone.trim()) problems.milestone = 'Name the milestone delivered';
  if (!Number.isFinite(claimedValue) || claimedValue <= 0) problems.claimed = 'Whole riyals, digits only';
  if (!verifiedBy.trim()) problems.verifiedBy = 'Who verified it';
  if (!isDate(verifiedOn)) problems.verifiedOn = 'A date, as YYYY-MM-DD';
  if (!verifiedRef.trim()) problems.verifiedRef = 'The consultant’s reference';
  if (!Number.isFinite(verifiedValue) || verifiedValue < 0) problems.verified = 'Whole riyals, digits only';
  else if (Number.isFinite(claimedValue) && verifiedValue > claimedValue) {
    problems.verified = 'A consultant cannot verify more than was claimed';
  }
  if (!Number.isFinite(approvedValue) || approvedValue <= 0) problems.approved = 'Whole riyals, digits only';
  else if (Number.isFinite(verifiedValue) && approvedValue > verifiedValue) {
    problems.approved = 'An approval cannot exceed what the consultant verified';
  } else if (approvedValue > headroom) {
    problems.approved = `Exceeds cost incurred: only ${fmt(Math.max(0, headroom))} SAR of actual cost is not yet certified`;
  }
  if (!Number.isFinite(rateValue) || rateValue < 0 || rateValue > 100) problems.rate = 'A percentage, 0 to 100';
  const valid = Object.keys(problems).length === 0;

  const clear = (): void => {
    setReference(''); setMilestone(''); setClaimed('');
    setVerifiedBy(''); setVerifiedOn(''); setVerifiedRef(''); setVerified('');
    setApproved(''); setRate(''); setTried(false);
  };

  const submit = (): void => {
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    commit({
      kind: 'claim:record',
      at: new Date().toISOString(),
      projectId: p.id,
      packageId,
      milestone: milestone.trim(),
      claimed: claimedValue,
      verifiedBy: verifiedBy.trim(),
      verifiedOn,
      verifiedRef: verifiedRef.trim(),
      verified: verifiedValue,
      approved: approvedValue,
      retentionRate: rateValue,
      reference: reference.trim(),
    }).then(() => {
      toast('Claim recorded', `${reference.trim()} · ${fmt(approvedValue)} SAR approved, ${fmt(net)} SAR paid`);
      clear();
      setOpen(false);
    }).catch((err: unknown) => {
      toastError(err, 'Claim refused');
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
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {/* Said, not merely enforced: a dead button teaches a person that
              the system is broken, when the truth is that a claim is recorded
              against an awarded contract and this development has none. */}
          {!awarded.length && (
            <span className="form-hint" style={{ marginTop: 0 }}>
              No awarded package yet — a claim is recorded against an awarded contract.
            </span>
          )}
          <button type="button" className="btn btn-primary" disabled={!awarded.length}
            onClick={() => { setOpen(true); }}>
            {Ic('plus', 15)}Record claim
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
      <form className="card-b" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 14 }}>{`Record an approved payment claim for ${p.id}`}</h3>
          <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Cancel"
            onClick={() => { clear(); setOpen(false); }}>{Ic('x', 15)}</button>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="cl-pkg">Package</label>
            <select id="cl-pkg" value={packageId} onChange={(e) => { setPackageId(e.target.value); setRate(''); }}>
              {awarded.map((x) => (
                <option key={x.id} value={x.id}>{`${x.id} · ${x.contractor}`}</option>
              ))}
            </select>
            {error('packageId')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-ref">Claim reference</label>
            <input id="cl-ref" placeholder="e.g. PC-2026-049" value={reference} autoFocus
              onChange={(e) => setReference(e.target.value)} />
            {error('reference')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-ms">Milestone delivered</label>
            <input id="cl-ms" placeholder="e.g. M-08 Level 3 slab" value={milestone}
              onChange={(e) => setMilestone(e.target.value)} />
            {error('milestone')}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0 12px' }} />
        <div className="kv-l" style={{ marginBottom: 8 }}>The consultant&rsquo;s verification, as recorded</div>
        <div className="form-row" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="cl-vby">Verified by</label>
            <input id="cl-vby" placeholder="e.g. Ledger Quantity Surveyors" value={verifiedBy}
              onChange={(e) => setVerifiedBy(e.target.value)} />
            {error('verifiedBy')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-von">Verified on</label>
            <input id="cl-von" placeholder="2026-06-04" value={verifiedOn}
              onChange={(e) => setVerifiedOn(e.target.value)} />
            {error('verifiedOn')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-vref">Reference</label>
            <input id="cl-vref" placeholder="e.g. VR-153" value={verifiedRef}
              onChange={(e) => setVerifiedRef(e.target.value)} />
            {error('verifiedRef')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-verified">Verified (SAR)</label>
            <input id="cl-verified" placeholder="e.g. 55,100,000" inputMode="numeric" value={verified}
              onChange={(e) => setVerified(e.target.value)} />
            {error('verified')}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0 12px' }} />
        <div className="form-row" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="cl-claimed">Claimed by the contractor (SAR)</label>
            <input id="cl-claimed" placeholder="e.g. 58,400,000" inputMode="numeric" value={claimed}
              onChange={(e) => setClaimed(e.target.value)} />
            {error('claimed')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-approved">Approved by Tazayud (SAR)</label>
            <input id="cl-approved" placeholder="e.g. 55,100,000" inputMode="numeric" value={approved}
              onChange={(e) => setApproved(e.target.value)} />
            {error('approved')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-rate">Retention on this claim (%)</label>
            <input id="cl-rate" inputMode="decimal"
              placeholder={chosen ? `${chosen.retention} from the payment terms` : '0'}
              value={rate} onChange={(e) => setRate(e.target.value)} />
            {error('rate')}
          </div>
          <div className="form-field">
            <label htmlFor="cl-net">Withheld, and net payable</label>
            <div id="cl-net" className="muted"
              style={{ fontSize: 12.5, paddingTop: 9, fontVariantNumeric: 'tabular-nums' }}>
              {Number.isFinite(approvedValue)
                ? `${fmt(retention)} withheld · ${fmt(net)} paid`
                : 'Enter the approved amount'}
            </div>
          </div>
        </div>

        <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 620 }}>
            The approved amount moves certified to date, and the net of retention moves payments
            made. What is withheld stays held as security until handover and closeout. Earned value
            and actual cost come from Period Entry, so the period covering this work is filed first;
            a claim above the cost incurred is refused.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" disabled={busy}
              onClick={() => { clear(); setOpen(false); }}>Cancel</button>
            <button type="submit" className="btn btn-gold" disabled={busy}>
              {Ic('check', 15)}{busy ? 'Recording…' : 'Record claim'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
