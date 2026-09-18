import { useState } from 'react';
import type { DeliveryRoute, Portfolio, Project } from '@/domain/types';
import { parseDate } from '@/domain/calendar';
import { SELF_EXECUTION } from '@/domain/portfolios';
import { fmt } from '@/domain/format';
import { useCorporate, useMutations } from '@/state/DataProvider';
import { Ic, toast, toastError, useEscape } from '@/components';

/** "1,000,000,000" or "1000000000" → 1000000000; NaN otherwise. */
const parseBudget = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
};


/**
 * Amend a development's details.
 *
 * This is the form that turns a demonstration into a register. The system was
 * seeded with placeholder developments so it could be shown before the real
 * portfolio existed, and until now correcting one of those names meant a
 * developer writing a migration — the owner's own register out of the owner's
 * reach. Here it is a recorded change like any other, filed by the seat that
 * registers developments in the first place.
 *
 * FIVE FIELDS, and the line they sit on the right side of:
 *
 *   name, portfolio, delivery route, delivery partner, approved budget
 *
 * Every one of them DESCRIBES the development. Not one of them MEASURES it.
 * Actual cost, earned value, certified and paid are the product of periods
 * and certificates that were entered by one person, validated by a second and
 * approved by a third; a form able to overwrite those would be a way around
 * the entire workflow, so this one cannot reach them and the route refuses
 * them if anything tries.
 *
 * The budget is the single field with arithmetic behind it. The control
 * budget is the part of the authorised figure already broken into work
 * packages, so the authorised figure may not be set below it — cutting it
 * would not shrink the packages, it would only make the two disagree, and
 * control 1 compares exactly those two. The server says so in a sentence
 * rather than letting it come back as a reconciliation failure.
 *
 * The note is required. An amendment to a register that does not say why it
 * was made is the kind of edit an auditor asks about a year later and nobody
 * can answer.
 */
export function EditProject({ p, onClose }: { p: Project; onClose: () => void }) {
  // The lists as this deployment holds them, not two constants in this file.
  // An administrator who adds a portfolio or a delivery route gets it here on
  // the next load, without a deploy.
  const { portfolios, routes } = useCorporate();
  const { commit } = useMutations();
  const [name, setName] = useState(p.name);
  const [portfolio, setPortfolio] = useState<Portfolio>(p.portfolio);
  const [route, setRoute] = useState<DeliveryRoute>(p.route);
  const [pmc, setPmc] = useState(p.pmc);
  const [budget, setBudget] = useState(String(p.budget));
  const [start, setStart] = useState(p.start);
  const [finish, setFinish] = useState(p.finish);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  useEscape(busy ? () => { /* a write is in flight */ } : onClose);

  const budgetValue = parseBudget(budget);

  const problems: Record<string, string> = {};
  if (!name.trim()) problems.name = 'A development needs a name';
  if (!pmc.trim()) problems.pmc = 'Name the PMC, or the internal team delivering it';
  if (!budget.trim()) problems.budget = 'Enter the Approved Development Budget in SAR';
  else if (!Number.isFinite(budgetValue) || budgetValue <= 0) problems.budget = 'A positive amount in SAR, digits only';
  else if (budgetValue < p.control) {
    problems.budget = `Cannot go below the control budget of ${fmt(p.control)} SAR, which is already broken into work packages`;
  }
  // The programme dates travel only when they change, and a changed one must
  // be a date the reporting calendar can cut against — the year strip, the
  // period numbering and the past-finish test all parse it.
  const startChanged = start.trim() !== p.start && start.trim() !== '';
  const finishChanged = finish.trim() !== p.finish && finish.trim() !== '';
  if (startChanged && parseDate(start.trim()) === null) problems.start = 'A date, e.g. 2025-08-01';
  if (finishChanged && parseDate(finish.trim()) === null) problems.finish = 'A date, e.g. 2026-08-01';
  {
    const s = parseDate(startChanged ? start.trim() : p.start);
    const f = parseDate(finishChanged ? finish.trim() : p.finish);
    if ((startChanged || finishChanged) && s !== null && f !== null && f <= s) {
      problems.finish = 'The planned finish must come after the start';
    }
  }
  if (!note.trim()) problems.note = 'Say why the record is being corrected';

  // Only what actually changed travels. A no-op amendment would put an entry
  // in the change log that changed nothing, and an audit trail full of those
  // is an audit trail nobody reads.
  const changes = {
    ...(name.trim() !== p.name ? { name: name.trim() } : {}),
    ...(portfolio !== p.portfolio ? { portfolio } : {}),
    ...(route !== p.route ? { route } : {}),
    ...(pmc.trim() !== p.pmc ? { pmc: pmc.trim() } : {}),
    ...(Number.isFinite(budgetValue) && Math.round(budgetValue) !== p.budget
      ? { budget: Math.round(budgetValue) } : {}),
    ...(startChanged ? { start: start.trim() } : {}),
    ...(finishChanged ? { finish: finish.trim() } : {}),
  };
  const changed = Object.keys(changes);
  const valid = Object.keys(problems).length === 0 && changed.length > 0;

  const submit = (): void => {
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    // The note travels TWICE and means the same thing both times: it is the
    // amendment's own record in the change log, and — where this seat proposes
    // rather than acts — the reason the Director will read. Asking for two
    // sentences that must agree would be asking a person to write the same
    // thing twice and inviting them not to.
    commit({
      kind: 'project:update',
      at: new Date().toISOString(),
      projectId: p.id,
      ...changes,
      note: note.trim(),
    }, note.trim()).then((result) => {
      if (result.queued) {
        toast(
          'Amendment sent for authorisation',
          `Proposal #${result.request.id} — ${result.request.summary}. `
            + 'Nothing has moved until the Director authorises it.',
          'info',
        );
      } else {
        toast('Development amended', `${p.id} · ${changed.length} field${changed.length === 1 ? '' : 's'} corrected`);
      }
      onClose();
    }).catch((err: unknown) => {
      toastError(err, 'Amendment refused');
      setBusy(false);
    });
  };

  const error = (key: string) => (tried && problems[key]
    ? <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{problems[key]}</div>
    : null);

  const LABEL: Record<string, string> = {
    name: 'name', portfolio: 'portfolio', route: 'delivery route',
    pmc: 'delivery partner', budget: 'approved budget',
    start: 'start', finish: 'planned finish',
  };

  return (
    <div className="modal-scrim" onClick={busy ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-project-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h2 id="edit-project-title">{`Amend ${p.id}`}</h2>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }}
            aria-label="Close" onClick={onClose}>{Ic('x', 17)}</button>
        </div>

        <form className="modal-b" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.65, marginBottom: 14 }}>
            These fields describe the development. Its reported position — cost incurred, earned
            value, certified and paid — comes from approved reporting periods and payment claims,
            and is not editable here.
          </div>

          <div className="form-field full" style={{ marginBottom: 14 }}>
            <label htmlFor="ep-name">Project Name</label>
            <input id="ep-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            {error('name')}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="ep-portfolio">Portfolio</label>
              <select id="ep-portfolio" value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}>
                {portfolios.map((x) => <option key={x.name}>{x.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="ep-route">Delivery Route</label>
              <select id="ep-route" value={route}
                onChange={(e) => setRoute(e.target.value)}>
                {routes.map((r) => <option key={r.name}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="ep-pmc">
                {route === SELF_EXECUTION ? 'Delivering team' : 'Project Management Consultant'}
              </label>
              <input id="ep-pmc" value={pmc} onChange={(e) => setPmc(e.target.value)} />
              {error('pmc')}
            </div>
            <div className="form-field">
              <label htmlFor="ep-budget">Approved Budget (SAR)</label>
              <input id="ep-budget" inputMode="numeric" value={budget}
                onChange={(e) => setBudget(e.target.value)} />
              {error('budget')}
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {`Control budget ${fmt(p.control)} · AFC ${fmt(p.afc)}`}
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="ep-start">Start</label>
              <input id="ep-start" placeholder="e.g. 2025-08-01" value={start}
                onChange={(e) => setStart(e.target.value)} />
              {error('start')}
            </div>
            <div className="form-field">
              <label htmlFor="ep-finish">Planned finish</label>
              <input id="ep-finish" placeholder="e.g. 2026-08-01" value={finish}
                onChange={(e) => setFinish(e.target.value)} />
              {error('finish')}
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                The reporting calendar is cut against these — the workspace&rsquo;s year strip,
                the period numbering, and whether a reported month is past the planned finish.
              </div>
            </div>
          </div>

          <div className="form-field full" style={{ marginBottom: 6 }}>
            <label htmlFor="ep-note">Reason for the amendment</label>
            <input id="ep-note" placeholder="e.g. Registered name corrected to the title-deed name"
              value={note} onChange={(e) => setNote(e.target.value)} />
            {error('note')}
          </div>

          <div className="muted" style={{ fontSize: 11.5, minHeight: 18 }}>
            {changed.length
              ? `Will amend: ${changed.map((k) => LABEL[k]).join(', ')}.`
              : 'Nothing has been changed yet.'}
          </div>
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-gold" onClick={submit} disabled={busy}>
            {Ic('check', 15)}{busy ? 'Saving…' : 'Save amendment'}
          </button>
        </div>
      </div>
    </div>
  );
}
