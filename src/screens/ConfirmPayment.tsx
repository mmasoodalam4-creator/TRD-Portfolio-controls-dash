import { useState } from 'react';
import { DATA_DATE_MS } from '@/domain/calendar';
import type { PaymentClaim, Project } from '@/domain/types';
import { fmt } from '@/domain/format';
import { useMutations } from '@/state/DataProvider';
import { Ic, toast, toastError } from '@/components';

/** "48,500,000" or "48500000" → 48500000; NaN otherwise. */
const parseMoney = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
};

const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * CONFIRM THAT A PAYMENT WAS MADE.
 *
 * On the owner's instruction, paid is confirmed and never inferred: approving
 * a claim says what a contractor is owed, and somebody has to say separately
 * that the money left the account. That somebody is the PMO manager. Every
 * other seat sees the claim sitting at Approved and this form is not offered
 * to them; the server refuses it whatever the screen does.
 *
 * The amount defaults to the net still outstanding on the claim — approved
 * less the retention withheld from it, less anything already transferred — and
 * is editable, because a payment run can settle part of a claim and often
 * does. It is capped at what is outstanding across the whole development,
 * because control 14 refuses a transfer that would take paid above certified
 * and a form that let somebody type it would be a form that fails on submit.
 *
 * The claim is named for the audit trail. Where the money LANDS in the
 * register is decided by the register: transfers are applied oldest claim
 * first, which is what a payment run does, and inventing a per-claim paid
 * figure here would let a claim be paid an amount its own arithmetic does not
 * produce.
 */
export function ConfirmPayment({ p, claim, onDone }: {
  p: Project;
  claim: PaymentClaim;
  onDone?: () => void;
}) {
  const { commit } = useMutations();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  // What this claim still has outstanding, and what the development does.
  const due = Math.max(0, (claim.approved ?? 0) - claim.retention + claim.released - claim.paid);
  const headroom = Math.max(0, p.ipcSubmitted - p.paid);

  // RELEASING RETENTION IS THE SAME ACT — money leaving the account — so it
  // is the same form and the same mutation. A claim paid its full net still
  // holds what was withheld from it as security, and until this branch there
  // was no door to release it: the button below only ever showed on a claim
  // awaiting transfer, so a development whose every claim was settled could
  // never return the security it held. The register applies a transfer above
  // the net total as released retention, oldest claims first — the same
  // waterfall a real release run follows.
  const held = Math.max(0, claim.retention - claim.released);
  const release = due === 0 && held > 0;

  const [amount, setAmount] = useState(String(Math.min(release ? held : due, headroom)));
  // Seeded from the reporting calendar, not the machine clock: the position
  // is "as at" the data date, and a transfer seeded with next spring's date
  // because that is what the wall clock said is a date nobody typed. Still
  // freely edited — the transfer instruction is where the real one comes from.
  const [valueDate, setValueDate] = useState(new Date(DATA_DATE_MS).toISOString().slice(0, 10));
  const [reference, setReference] = useState('');

  const value = parseMoney(amount);
  const problems: Record<string, string> = {};
  if (!Number.isFinite(value) || value <= 0) problems.amount = 'Whole riyals, digits only';
  else if (value > headroom) {
    problems.amount = `Exceeds certified: only ${fmt(headroom)} SAR of certified value is not yet paid`;
  }
  if (!isDate(valueDate)) problems.valueDate = 'A date, as YYYY-MM-DD';
  if (!reference.trim()) problems.reference = 'The bank or treasury reference';
  const valid = Object.keys(problems).length === 0;

  const submit = (): void => {
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    commit({
      kind: 'claim:pay',
      at: new Date().toISOString(),
      projectId: p.id,
      claimId: claim.id,
      amount: value,
      valueDate,
      reference: reference.trim(),
    }).then(() => {
      toast(release ? 'Retention released' : 'Payment confirmed',
        `${claim.id} · ${fmt(value)} SAR transferred`);
      setOpen(false);
      setTried(false);
      setReference('');
      onDone?.();
    }).catch((err: unknown) => {
      toastError(err, 'Payment not recorded');
    }).finally(() => { setBusy(false); });
  };

  const error = (key: string) => (tried && problems[key]
    ? <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{problems[key]}</div>
    : null);

  if (!open) {
    return (
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        {/* Said, not merely disabled. A dead button teaches a person the
            system is broken; the truth is that this development has certified
            everything it has paid, so there is nothing outstanding to settle. */}
        {headroom === 0 && (
          <span className="form-hint" style={{ marginTop: 0 }}>
            Nothing outstanding — everything certified on this development has been paid.
          </span>
        )}
        <button type="button" className="btn btn-gold" disabled={headroom === 0}
          onClick={() => { setOpen(true); }}>
          {Ic('coins', 15)}{release ? 'Release retention' : 'Confirm payment'}
        </button>
      </div>
    );
  }

  return (
    <form className="card" style={{ marginTop: 14, background: 'var(--bg)' }} noValidate
      onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="card-b">
        <div className="between" style={{ marginBottom: 10 }}>
          <h3 style={{ fontSize: 14 }}>
            {release ? `Release retention — ${claim.id}` : `Confirm payment — ${claim.id}`}
          </h3>
          <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Cancel"
            onClick={() => { setOpen(false); setTried(false); }}>{Ic('x', 15)}</button>
        </div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
          {release
            ? 'You are recording that withheld security has been returned. It moves '
            : 'You are recording that money has left the account. It moves '}
          <strong>paid</strong>
          {release
            ? ' and nothing else. The register applies a transfer above the net total as released '
              + 'retention, oldest claims first — where it lands is the register’s arithmetic, '
              + 'and this claim is named for the audit trail.'
            : ' and nothing else — the work was certified when this claim was approved, so '
              + 'certifying it again here would count the milestone twice.'}
        </p>

        <div className="form-row" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="cp-amt">{release ? 'Retention released (SAR)' : 'Net transferred (SAR)'}</label>
            <input id="cp-amt" value={amount} inputMode="numeric" autoFocus
              onChange={(e) => { setAmount(e.target.value); }} />
            {error('amount')}
          </div>
          <div className="form-field">
            <label htmlFor="cp-date">Value date</label>
            <input id="cp-date" value={valueDate} placeholder="2026-10-15"
              onChange={(e) => { setValueDate(e.target.value); }} />
            {error('valueDate')}
          </div>
          <div className="form-field">
            <label htmlFor="cp-ref">Transfer reference</label>
            <input id="cp-ref" value={reference} placeholder="e.g. TT-2026-10-0184"
              onChange={(e) => { setReference(e.target.value); }} />
            {error('reference')}
          </div>
        </div>

        <p className="form-hint">
          {`Approved ${fmt(claim.approved ?? 0)} · retention withheld ${fmt(claim.retention)}`
            + `${claim.released ? ` · released ${fmt(claim.released)}` : ''}`
            + (release
              ? ` · still held as security ${fmt(held)}. `
              : ` · outstanding on this claim ${fmt(due)}. `)
            + `Across the development, ${fmt(headroom)} SAR of certified value is not yet paid.`}
        </p>

        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {Ic('check', 15)}{busy ? 'Recording…' : release ? 'Release retention' : 'Confirm payment'}
          </button>
          <button type="button" className="btn btn-ghost"
            onClick={() => { setOpen(false); setTried(false); }}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
