import { useRef, useState } from 'react';
import type {
  ContractInput, CounterpartyRole, DeliveryRoute, PackageInput, Portfolio,
} from '@/domain/types';
import type { ProjectImport } from '@/state/DataProvider';
import { fmt } from '@/domain/format';
import {
  useCorporate, useMutations, useProjectTemplate, useProjects, useProposes,
} from '@/state/DataProvider';
import { Ic, saveBase64, toast, toastError, useEscape } from '@/components';

interface Form {
  id: string;
  name: string;
  portfolio: Portfolio;
  route: DeliveryRoute;
  budget: string;
}

/** The identifier the server accepts: three capitals, a dash, two digits. */
const PROJECT_ID = /^[A-Z]{3}-\d{2}$/;

/** "1,000,000,000", "1 000 000 000" or "1000000000" → 1000000000; NaN otherwise. */
const parseBudget = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
};

/**
 * Register a new development.
 *
 * The budget captured is the Approved Development Budget — the owner's
 * authorised spend, which every downstream control measures against.
 * Creation is a real mutation: the development appears in every scope and
 * register the moment it is committed, with nothing spent and no registers.
 */
export function AddProject({ onClose }: { onClose: () => void }) {
  // The lists this deployment holds. An administrator who adds a portfolio
  // gets it in this dropdown on the next load, with no deploy.
  const { portfolios, routes } = useCorporate();
  const { commit } = useMutations();
  const proposes = useProposes();
  // Whether registering will be PROPOSED rather than applied. Asked before
  // the form is filled, so the reason field appears where it is needed and
  // the button says what it will actually do.
  const willPropose = proposes('project:create');
  const [reason, setReason] = useState('');
  const existing = useProjects();
  const [f, setF] = useState<Form>({
    // The first of each list rather than two names written here: a deployment
    // that renamed its portfolios would otherwise open this form on one that
    // no longer exists, and the select would show blank.
    id: '',
    name: '',
    portfolio: portfolios[0]?.name ?? '',
    route: routes[0]?.name ?? '',
    budget: '',
  });
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const { download, parse } = useProjectTemplate();
  const file = useRef<HTMLInputElement>(null);
  // What a filled workbook said. Held here, unregistered, until the person
  // presses Create — importing fills the form, it does not register anything.
  const [read, setRead] = useState<ProjectImport | null>(null);
  useEscape(onClose);

  const id = f.id.trim().toUpperCase();
  const name = f.name.trim();
  const budget = parseBudget(f.budget);

  const problems: Partial<Record<keyof Form, string>> = {};
  if (!id) problems.id = 'Project ID is required';
  else if (!PROJECT_ID.test(id)) problems.id = 'Use the form RES-03: three letters, a dash, two digits';
  else if (existing.some((p) => p.id === id)) problems.id = `${id} is already registered`;
  if (!name) problems.name = 'Project name is required';
  if (!f.budget.trim()) problems.budget = 'Enter the Approved Development Budget in SAR';
  else if (!Number.isFinite(budget) || budget <= 0) problems.budget = 'Enter a positive amount in SAR, digits only';

  const valid = Object.keys(problems).length === 0;

  const submit = () => {
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    // The workbook's rows travel with the registration, so the development
    // arrives with its work breakdown and its awarded packages rather than as
    // an empty shell somebody has to fill in afterwards.
    const packages: PackageInput[] | undefined = read?.packages.length
      ? read.packages.map((k) => ({
        code: k.code, name: k.name, phase: '', budget: k.budget,
        plannedPct: 0, actualPct: 0, cost: 0, committed: 0,
      }))
      : undefined;
    const contracts: ContractInput[] | undefined = read?.contracts.length
      ? read.contracts.map((c) => ({
        id: c.id, name: c.name, wbs: c.wbs, contractor: c.contractor,
        role: c.role as CounterpartyRole, value: c.value,
        retention: c.retention, awarded: c.awarded,
      }))
      : undefined;

    commit({
      kind: 'project:create',
      at: new Date().toISOString(),
      project: { id, name, portfolio: f.portfolio, route: f.route, budget },
      ...(packages ? { packages } : {}),
      ...(contracts ? { contracts } : {}),
    }, reason.trim()).then((result) => {
      if (result.queued) {
        toast(
          'Registration sent for authorisation',
          `Proposal #${result.request.id} — ${result.request.summary}. `
            + 'The development is not in the portfolio until the Director authorises it.',
          'info',
        );
      } else {
        toast('Project Created', `${id} — ${name}`);
      }
      onClose();
    }).catch((err: unknown) => {
      toastError(err, 'Project not created');
      setBusy(false);
    });
  };

  const error = (key: keyof Form) => (tried && problems[key]
    ? <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{problems[key]}</div>
    : null);

  return (
    <div className="modal-scrim" onClick={busy ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-project-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h2 id="add-project-title">Add New Project</h2>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Close" onClick={onClose}>{Ic('x', 17)}</button>
        </div>

        <form className="modal-b" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
            <div className="card-b">
              <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 380 }}>
                  A development has work packages and counterparties. Fill the workbook and import
                  it, and they arrive with it — <b>importing fills this form; it registers nothing</b>.
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <input ref={file} type="file" hidden accept=".xlsx"
                    onChange={(e) => {
                      const chosen = e.target.files?.[0];
                      if (!chosen) return;
                      setBusy(true);
                      chosen.arrayBuffer()
                        .then(parse)
                        .then((got) => {
                          setRead(got);
                          // Only what the sheet actually filled in. Assigning
                          // every field blanked whatever the person had
                          // already typed whenever the workbook left it empty,
                          // which is what happens on the very first import.
                          setF((prev) => ({
                            id: got.project.id || prev.id,
                            name: got.project.name || prev.name,
                            portfolio: (got.project.portfolio || prev.portfolio),
                            route: (got.project.route || prev.route),
                            budget: got.project.budget ? String(got.project.budget) : prev.budget,
                          }));
                          const ignored = got.skipped.packages + got.skipped.contracts;
                          toast('Workbook read',
                            `${got.packages.length} packages, ${got.contracts.length} contracts`
                            + (ignored ? ` · ${ignored} unfilled row${ignored === 1 ? '' : 's'} ignored` : ''));
                        })
                        .catch((err: unknown) => { toastError(err, 'Workbook not read'); })
                        .finally(() => { setBusy(false); if (file.current) file.current.value = ''; });
                    }} />
                  <button type="button" className="btn btn-ghost" disabled={busy}
                    onClick={() => {
                      download()
                        .then((t) => {
                          saveBase64(t.filename, t.base64);
                          toast('Template downloaded', t.filename, 'info');
                        })
                        .catch((err: unknown) => { toastError(err, 'Template unavailable'); });
                    }}>
                    {Ic('download', 15)}Download template
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={busy}
                    onClick={() => file.current?.click()}>
                    {Ic('upload', 15)}Import filled workbook
                  </button>
                </div>
              </div>

              {read && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div className="form-row" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginBottom: 0 }}>
                    <div>
                      <div className="kv-l">Work packages</div>
                      <div style={{ fontWeight: 700 }}>{read.packages.length}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {`${fmt(read.packages.reduce((a, k) => a + k.budget, 0))} control budget`}
                      </div>
                    </div>
                    <div>
                      <div className="kv-l">Contract packages</div>
                      <div style={{ fontWeight: 700 }}>{read.contracts.length}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {`${read.contracts.filter((c) => c.awarded).length} awarded, the rest out to tender`}
                      </div>
                    </div>
                    <div>
                      <div className="kv-l">Committed on award</div>
                      <div style={{ fontWeight: 700 }}>
                        {fmt(read.contracts.filter((c) => c.awarded).reduce((a, c) => a + c.value, 0))}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>A tendered package commits nothing</div>
                    </div>
                  </div>
                  {(read.skipped.packages > 0 || read.skipped.contracts > 0) && (
                    // Said plainly, because the arithmetic above is the
                    // arithmetic of the rows that were KEPT.
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
                      {`${read.skipped.packages} package row${read.skipped.packages === 1 ? '' : 's'} `
                        + `and ${read.skipped.contracts} contract row${read.skipped.contracts === 1 ? '' : 's'} `
                        + 'were left unfilled and are not registered. A package needs a budget; '
                        + 'a contract needs a counterparty and a value.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="ap-id">Project ID</label>
              <input id="ap-id" placeholder="e.g. RES-03" value={f.id} autoFocus
                onChange={(e) => setF({ ...f, id: e.target.value })} />
              {error('id')}
            </div>
            <div className="form-field">
              <label htmlFor="ap-portfolio">Portfolio</label>
              <select id="ap-portfolio" value={f.portfolio} onChange={(e) => setF({ ...f, portfolio: e.target.value })}>
                {portfolios.map((p) => <option key={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-field full" style={{ marginBottom: 14 }}>
            <label htmlFor="ap-name">Project Name</label>
            <input id="ap-name" placeholder="e.g. Naseem Gardens" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            {error('name')}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="ap-route">Delivery Route</label>
              <select id="ap-route" value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })}>
                {routes.map((r) => <option key={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="ap-budget">Approved Budget (SAR)</label>
              <input id="ap-budget" placeholder="e.g. 1,000,000,000" inputMode="numeric" value={f.budget}
                onChange={(e) => setF({ ...f, budget: e.target.value })} />
              {error('budget')}
            </div>
          </div>
          {/* WHY, for a seat that proposes rather than acts. Asked only on
              that road: a Director registering a development directly is the
              act, and the change log already names them and dates it. */}
          {willPropose && (
            <div className="form-field full" style={{ marginTop: 4 }}>
              <label htmlFor="ap-reason">
                {'Why is this development being registered? '}
                <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <textarea id="ap-reason" rows={2} maxLength={2000} value={reason}
                aria-describedby="ap-reason-hint"
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Board approved the acquisition on 2 September 2026"
                style={{ font: 'inherit', fontSize: 12.5, border: '1px solid var(--line)', borderRadius: 9, padding: '9px 11px' }} />
              <div id="ap-reason-hint" className="form-hint">
                {reason.trim()
                  ? 'Your seat proposes this registration; the Director authorises it. Nothing is '
                    + 'in the portfolio until they do, and this is what they will read.'
                  : 'Required. Your seat proposes this registration rather than making it, and '
                    + 'the Director needs a reason to decide from.'}
              </div>
            </div>
          )}
          {/* A submit control inside the form so Enter files it; the visible buttons sit in the footer. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-gold" onClick={submit}
            disabled={busy || (willPropose && !reason.trim())}>
            {Ic('plus', 15)}
            {busy ? 'Creating…' : willPropose ? 'Send for authorisation' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
