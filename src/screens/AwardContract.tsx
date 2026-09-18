import { useState } from 'react';
import type { CounterpartyRole, ProcurementPackage, Project } from '@/domain/types';
import { DATA_DATE_MS } from '@/domain/calendar';
import { fmt } from '@/domain/format';
import { useMutations, useProposes } from '@/state/DataProvider';
import { Ic, toast, toastError } from '@/components';

/** "48,500,000" or "48500000" → 48500000; NaN otherwise. */
const parseMoney = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
};

const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const ROLES: readonly CounterpartyRole[] = [
  'Main Contractor', 'Trade Contractor', 'Supplier',
  'PMC', 'Design Consultant', 'Verification Consultant',
];

/**
 * Record a contract package, or award one that is out to tender.
 *
 * Registration used to be the only door contracts had — a development that
 * later bought another slice of scope had no way to say so, which was the
 * next dead end a real user hit. This is the door: one form, two acts,
 * decided at the top.
 *
 *   - A NEW package is appended to the register — out to tender (an estimate,
 *     committing nobody) or awarded, in which case its value reaches
 *     committed cost exactly as an award at registration does.
 *   - AWARDING a tendered package replaces the estimate with the award: the
 *     real value, the real counterparty, the award date. A package already
 *     awarded is not offered — an award is a promise, and correcting one is a
 *     story for the audit trail, not a silent overwrite.
 *
 * Awarding is a commercial act, so the server allows it only to the approver
 * and the administrator, and refuses an award that would take committed cost
 * past the approved budget — said in a sentence before anything is written.
 */
export function AwardContract({ p, packages }: {
  p: Project;
  packages: readonly ProcurementPackage[];
}) {
  const { commit } = useMutations();
  const proposes = useProposes();
  // Whether recording a package will be PROPOSED rather than applied. An
  // award promises the owner's money, so on the platform it takes the same
  // two people as every other act that decides what a development is.
  const willPropose = proposes('contract:award');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const tendered = packages.filter((x) => x.awarded === null);
  /** 'new', or the id of a tendered package being awarded. */
  const [target, setTarget] = useState('new');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [wbs, setWbs] = useState('');
  const [contractor, setContractor] = useState('');
  const [role, setRole] = useState<CounterpartyRole>('Trade Contractor');
  const [value, setValue] = useState('');
  const [retention, setRetention] = useState('5');
  const [toTender, setToTender] = useState(false);
  // Seeded from the reporting calendar, not the machine clock — the position
  // is "as at" the data date. Freely edited; the letter of award is where the
  // real date comes from.
  const [awardedOn, setAwardedOn] = useState(new Date(DATA_DATE_MS).toISOString().slice(0, 10));

  const awarding = target !== 'new' ? tendered.find((x) => x.id === target) : undefined;
  const effId = awarding ? awarding.id : id.trim();
  const effName = name.trim();
  const effWbs = wbs.trim();
  const effContractor = contractor.trim();
  const effRole = awarding ? awarding.role : role;
  const valueRaw = parseMoney(value);
  const rateValue = Number(retention);
  const isTender = target === 'new' && toTender;

  // Awarding a tendered package starts from what the tender said — the award
  // then corrects whatever the tender got wrong, value and counterparty
  // included. A new package starts blank.
  const pick = (t: string): void => {
    setTarget(t); setTried(false);
    const row = tendered.find((x) => x.id === t);
    if (row) {
      setName(row.name); setWbs(row.wbs); setContractor(row.contractor);
      setValue(String(row.value)); setRetention(String(row.retention)); setToTender(false);
    } else {
      setName(''); setWbs(''); setContractor(''); setValue(''); setRetention('5');
    }
  };

  const problems: Record<string, string> = {};
  if (!effId) problems.id = 'A package number, e.g. C-1.5';
  else if (target === 'new' && packages.some((x) => x.id === effId)) {
    problems.id = tendered.some((x) => x.id === effId)
      ? `${effId} is already registered as out to tender — choose “Award” above instead`
      : `${effId} already names a package on this development`;
  }
  if (!effName) problems.name = 'Name the scope this package buys';
  if (!effContractor) problems.contractor = isTender ? 'Who the tender is with, or the market it goes to' : 'Name the counterparty';
  if (!Number.isFinite(valueRaw) || valueRaw <= 0) problems.value = 'Whole riyals, digits only';
  else if (!isTender && p.committed + Math.round(valueRaw) > p.budget) {
    problems.value = `An award of ${fmt(Math.round(valueRaw))} would take committed cost past the approved budget of ${fmt(p.budget)}`;
  }
  if (!Number.isFinite(rateValue) || rateValue < 0 || rateValue > 100) problems.retention = 'A percentage, 0 to 100';
  if (!isTender && !isDate(awardedOn)) problems.awardedOn = 'A date, as YYYY-MM-DD';
  const valid = Object.keys(problems).length === 0;

  const clear = (): void => {
    setTarget('new'); setId(''); setName(''); setWbs(''); setContractor('');
    setRole('Trade Contractor'); setValue(''); setRetention('5'); setToTender(false);
    setReason(''); setTried(false);
  };

  const submit = (): void => {
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    commit({
      kind: 'contract:award',
      at: new Date().toISOString(),
      projectId: p.id,
      contract: {
        id: effId,
        name: effName,
        wbs: effWbs || '0',
        contractor: effContractor,
        role: effRole,
        value: Math.round(valueRaw),
        retention: rateValue,
        awarded: isTender ? null : awardedOn,
      },
    }, reason.trim()).then((result) => {
      if (result.queued) {
        toast(
          'Package sent for authorisation',
          `Proposal #${result.request.id} — ${result.request.summary}. `
            + 'Nothing is committed until the Director authorises it.',
          'info',
        );
      } else {
        toast(isTender ? 'Package recorded' : 'Package awarded',
          isTender
            ? `${effId} · out to tender at ${fmt(Math.round(valueRaw))} SAR`
            : `${effId} · ${effContractor} · ${fmt(Math.round(valueRaw))} SAR committed`);
      }
      clear();
      setOpen(false);
    }).catch((err: unknown) => {
      toastError(err, isTender ? 'Package not recorded' : 'Award refused');
    }).finally(() => { setBusy(false); });
  };

  const error = (key: string) => (tried && problems[key]
    ? <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{problems[key]}</div>
    : null);

  if (!open) {
    return (
      <div className="between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {`${fmt(p.committed)} SAR committed against an approved budget of ${fmt(p.budget)}`}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setOpen(true); }}>
          {Ic('plus', 15)}Record package
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
      <form className="card-b" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 14 }}>{`Record or award a contract package on ${p.id}`}</h3>
          <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Cancel"
            onClick={() => { clear(); setOpen(false); }}>{Ic('x', 15)}</button>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="aw-target">What is being recorded</label>
            <select id="aw-target" value={target}
              onChange={(e) => { pick(e.target.value); }}>
              <option value="new">A new package</option>
              {tendered.map((x) => (
                <option key={x.id} value={x.id}>{`Award ${x.id} — ${x.name} (out to tender)`}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="aw-id">Package number</label>
            <input id="aw-id" placeholder="e.g. C-1.6" value={awarding ? awarding.id : id}
              disabled={!!awarding} onChange={(e) => setId(e.target.value)} />
            {error('id')}
          </div>
          <div className="form-field">
            <label htmlFor="aw-name">Contract / scope</label>
            <input id="aw-name" placeholder="e.g. External works and landscaping"
              value={name} onChange={(e) => setName(e.target.value)} />
            {error('name')}
          </div>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="aw-contractor">Counterparty</label>
            <input id="aw-contractor" placeholder="e.g. Najd Landscapes Co."
              value={contractor} onChange={(e) => setContractor(e.target.value)} />
            {error('contractor')}
          </div>
          <div className="form-field">
            <label htmlFor="aw-role">Engaged as</label>
            <select id="aw-role" value={effRole} disabled={!!awarding}
              onChange={(e) => setRole(e.target.value as CounterpartyRole)}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="aw-wbs">WBS code</label>
            <input id="aw-wbs" placeholder="e.g. 1.6"
              value={wbs} onChange={(e) => setWbs(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="aw-value">{isTender ? 'Estimate (SAR)' : 'Award value (SAR)'}</label>
            <input id="aw-value" inputMode="numeric" placeholder="e.g. 2,800,000"
              value={value} onChange={(e) => setValue(e.target.value)} />
            {error('value')}
          </div>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          <div className="form-field">
            <label htmlFor="aw-retention">Retention in the payment terms (%)</label>
            <input id="aw-retention" inputMode="decimal" value={retention}
              onChange={(e) => setRetention(e.target.value)} />
            {error('retention')}
          </div>
          {target === 'new' && (
            <div className="form-field">
              <label htmlFor="aw-tender">Award status</label>
              <select id="aw-tender" value={toTender ? 'tender' : 'awarded'}
                onChange={(e) => setToTender(e.target.value === 'tender')}>
                <option value="awarded">Awarded — commits the owner</option>
                <option value="tender">Out to tender — an estimate, commits nobody</option>
              </select>
            </div>
          )}
          {!isTender && (
            <div className="form-field">
              <label htmlFor="aw-date">Awarded on</label>
              <input id="aw-date" placeholder="2026-08-31" value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)} />
              {error('awardedOn')}
            </div>
          )}
        </div>

        {/* WHY, for a seat that proposes rather than acts. */}
        {willPropose && (
          <div className="form-field full" style={{ marginBottom: 12 }}>
            <label htmlFor="aw-reason">
              {'Why is this package being recorded? '}
              <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <textarea id="aw-reason" rows={2} maxLength={2000} value={reason}
              aria-describedby="aw-reason-hint"
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Tender committee recommendation of 5 September 2026"
              style={{ font: 'inherit', fontSize: 12.5, border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px' }} />
            <div id="aw-reason-hint" className="form-hint">
              {reason.trim()
                ? 'Your seat proposes this package; the Director authorises it. Nothing is '
                  + 'committed until they do, and this is what they will read.'
                : 'Required. Your seat proposes this rather than recording it, and the Director '
                  + 'needs a reason to decide from.'}
            </div>
          </div>
        )}

        <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 620 }}>
            {isTender
              ? 'A package out to tender carries an estimate and a place in the forecast, and '
                + 'commits nobody — its value reaches committed cost only when it is awarded.'
              : 'Awarding commits the owner: the award value moves committed cost, which control 7 '
                + 'reconciles against this register. Certificates, claims and the reporting period '
                + 'then measure how it is delivered.'}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" disabled={busy}
              onClick={() => { clear(); setOpen(false); }}>Cancel</button>
            <button type="submit" className="btn btn-gold"
              disabled={busy || (willPropose && !reason.trim())}>
              {Ic('check', 15)}
              {busy ? 'Recording…'
                : willPropose ? 'Send for authorisation'
                  : isTender ? 'Record package' : 'Award package'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
