// ==========================================================================
// REPORTING PERIOD ENTRY
//
// The screen that turns this from a reporting viewer into a system of record.
// It is PT_TEMPLATE — the sheet project managers already fill each period —
// rendered as a form, in the same order, with the same section numbering, so
// someone who knows the workbook already knows this screen.
//
// TWO THINGS ARE DELIBERATELY NOT INPUTS.
//
// Section 3, the earned-value position, is computed from the work packages
// exactly as the sheet computes it: PV = budget x planned%, EV = budget x
// actual%. Earned value stops being a number somebody types and becomes a
// consequence of the packages, which is the whole reason to collect data this
// way.
//
// And the reconciliation status is computed live, before submission. The
// workbook prints "CHECK: differs from WBS" at its total row and leaves it to
// the reader; here the same disagreement is shown as it is created, so the
// person entering can fix it while they still have the figures in front of
// them. The server refuses a period that does not reconcile either way — this
// panel exists so that refusal is never a surprise.
// ==========================================================================
import { useEffect, useMemo, useState } from 'react';
import type { CategoryInput, PackageInput } from '@/domain/types';
import { positionFromPackages, progressOf } from '@/domain/calc';
import { fmt } from '@/domain/format';
import { useMutations, useRegisters, useTemplate } from '@/state/DataProvider';
import { useScope } from '@/state/ScopeProvider';
import { useAuth } from '@/state/AuthProvider';
import { Ic, toast, toastError } from '@/components';
import { NotYourSeat } from './NotYourSeat';
import { PickDevelopment } from './shared';

/** A blank row, so the register can be extended without leaving the screen. */
const emptyPackage = (): PackageInput => ({
  code: '', name: '', phase: '', budget: 0, plannedPct: 0, actualPct: 0, cost: 0, committed: 0,
});

const emptyCategory = (): CategoryInput => ({ cat: '', budget: 0, committed: 0, actual: 0, afc: 0 });

/** Percentages are entered as 0–100 and held as 0–1, the way the sheet does. */
const pct = (v: number): string => (v * 100).toFixed(2);
const parsePct = (s: string): number => Math.max(0, Math.min(100, Number(s) || 0)) / 100;
const parseMoney = (s: string): number => Math.max(0, Math.round(Number(s.replace(/,/g, '')) || 0));

/**
 * `defaultPeriod` and `defaultDataDate` come from the Project Workspace, where
 * a month is selected on the strip above this form: filing October means the
 * period number October would be and a data date of the last of the month.
 * Both stay editable — the period number is the project manager's to state and
 * the workbook is where it comes from. Absent (reached from a link, or from
 * the route on its own) the form behaves exactly as it did.
 */
export function PeriodEntry({ defaultPeriod, defaultDataDate }: {
  defaultPeriod?: number;
  defaultDataDate?: string;
} = {}) {
  const { scope, project } = useScope();
  const registers = useRegisters(project?.id ?? '');
  const { submitPeriod, parseTemplate } = useMutations();
  const getTemplate = useTemplate();
  const { canWrite, authRequired, account } = useAuth();

  // Seeded from the development's current register so a period starts from
  // last period's position rather than a blank sheet — which is how the
  // workbook is used, and the only way entry is realistic on eight projects.
  //
  // LEAVES ONLY. Seeding every row below the root put each level-1 package
  // AND its level-2 children in the sheet, so budgets and costs were counted
  // twice and the form opened already failing its own controls on every
  // development. A package that has children is a subtotal, not an entry.
  // Committed is taken from the procurement register, which is where it is
  // recorded; it was seeded as zero.
  const [packages, setPackages] = useState<PackageInput[]>(() => {
    const rows = registers.wbs.filter((n) => n.level > 0);
    const leaves = rows.filter((n) => !rows.some((o) => o.level > n.level && o.code.startsWith(`${n.code}.`)));
    const committedTotal = registers.procurement.reduce((t, x) => t + x.committed, 0);
    const budgetTotal = leaves.reduce((t, n) => t + n.budget, 0);
    return leaves.map((n) => ({
      code: n.code,
      name: n.name,
      phase: '',
      budget: n.budget,
      plannedPct: n.budget ? n.pv / n.budget : 0,
      actualPct: n.budget ? n.ev / n.budget : 0,
      cost: n.ac,
      committed: budgetTotal ? Math.round((n.budget / budgetTotal) * committedTotal) : 0,
    }));
  });

  const [categories, setCategories] = useState<CategoryInput[]>(() =>
    registers.costCategories.map((c) => ({
      cat: c.cat, budget: c.budget, committed: c.committed, actual: c.actual, afc: c.afc,
    })));

  const [period, setPeriod] = useState(
    String(defaultPeriod ?? ((project ? progressOf(project) : 0) > 0 ? 9 : 1)));
  const periodNo = Number(period);
  const periodValid = Number.isInteger(periodNo) && periodNo >= 1 && periodNo <= 999;
  const [dataDate, setDataDate] = useState(defaultDataDate ?? '');
  const [budget, setBudget] = useState(String(project?.budget ?? 0));
  const [control, setControl] = useState(String(project?.control ?? 0));
  const [afc, setAfc] = useState(String(project?.afc ?? 0));
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Moving the month on the workspace's strip means filing a different period,
  // so the period number and the data date follow it. They are still typed
  // over freely — this sets where they start, it does not hold them there.
  useEffect(() => {
    if (defaultPeriod !== undefined) setPeriod(String(defaultPeriod));
    if (defaultDataDate !== undefined) setDataDate(defaultDataDate);
  }, [defaultPeriod, defaultDataDate]);

  // Section 3, computed. Never typed.
  const position = useMemo(() => positionFromPackages(packages), [packages]);

  /**
   * The reconciliation identities, checked here as the figures are entered.
   *
   * These are the same two the server enforces before it will record the
   * period. Showing them live is not a substitute for that enforcement — it is
   * what stops the enforcement arriving as a surprise after ten minutes of
   * typing.
   */
  const checks = useMemo(() => {
    const packageTotal = packages.reduce((t, p) => t + p.budget, 0);
    const categoryAfc = categories.reduce((t, c) => t + c.afc, 0);
    const categoryActual = categories.reduce((t, c) => t + c.actual, 0);
    const controlNum = parseMoney(control);
    const afcNum = parseMoney(afc);

    return [
      {
        label: 'Work packages break down the control budget',
        a: packageTotal,
        b: controlNum,
        ok: packageTotal === controlNum,
      },
      {
        label: 'Cost categories forecast to the adopted AFC',
        a: categoryAfc,
        b: afcNum,
        ok: categoryAfc === afcNum,
      },
      {
        label: 'Cost incurred agrees between packages and categories',
        a: position.actual,
        b: categoryActual,
        ok: position.actual === categoryActual,
      },
    ];
  }, [packages, categories, control, afc, position.actual]);

  const reconciles = checks.every((c) => c.ok);

  if (!project) {
    return (
      <div className="card"><div className="card-b">
        <p className="muted">Select a single development to enter a reporting period.</p>
      </div></div>
    );
  }

  /**
   * Load a filled PT_TEMPLATE into the form.
   *
   * It fills the fields rather than filing the period. The reconciliation
   * panel below then shows whether the sheet agrees with itself, and the
   * person decides whether to submit it — an import that filed straight into
   * the workflow would be a way to enter data without looking at it.
   */
  const importSheet = (file: File) => {
    setImporting(true);
    void file.arrayBuffer()
      .then((buf) => parseTemplate(project.id, buf))
      .then((parsed) => {
        setPackages(parsed.packages);
        setCategories(parsed.categories);
        setPeriod(String(parsed.period));
        setDataDate(parsed.dataDate);
        setBudget(String(parsed.budget));
        setControl(String(parsed.control));
        setAfc(String(parsed.afc));
        toast(
          `Loaded ${parsed.packages.length} work packages`,
          'Check the figures below, then file for review',
        );
      })
      .catch((err: unknown) => { toastError(err, 'The workbook could not be read'); })
      .finally(() => { setImporting(false); });
  };

  /**
   * Hand over the blank workbook itself.
   *
   * The same sheet the importer reads, served by the API rather than found in
   * an old email: a copy whose rows have moved is refused by the structure
   * guard, and the person only discovers that after filling it in.
   */
  const downloadTemplate = () => {
    setDownloading(true);
    getTemplate()
      .then(({ filename, base64 }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
        toast('Template downloaded', `${filename} — fill it in, then import it here`);
      })
      .catch((err: unknown) => { toastError(err, 'The template could not be downloaded'); })
      .finally(() => { setDownloading(false); });
  };

  const setPackageField = (i: number, patch: Partial<PackageInput>) => {
    setPackages((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  };

  const setCategoryField = (i: number, patch: Partial<CategoryInput>) => {
    setCategories((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  };

  const submit = () => {
    setBusy(true);
    // submitPeriod, not commit. On the platform this files the period for
    // review and the reported position does NOT move until someone else
    // validates it and a third person signs it off. On the self-contained
    // demo there is nobody to review it, so it takes effect at once.
    void submitPeriod({
      kind: 'period:submit',
      at: new Date().toISOString(),
      projectId: project.id,
      period: periodNo,
      dataDate,
      budget: parseMoney(budget),
      control: parseMoney(control),
      afc: parseMoney(afc),
      packages,
      categories,
    })
      .then(() => {
        toast(`Period ${period} filed for ${project.id}`,
          authRequired ? 'Awaiting validation by a reviewer' : 'Recorded in the position');
      })
      // The server names the controls that failed. Showing that verbatim is
      // the point — a generic "save failed" would hide exactly the
      // information the controls exist to produce.
      .catch((err: unknown) => { toastError(err, 'The period was not recorded'); })
      .finally(() => { setBusy(false); });
  };

  // Entering a period is the project manager's act. A reviewer validates, an
  // approver signs off and an executive viewer reads; none of them enter, and
  // the server refuses them whatever this screen shows. Saying so here is
  // better than a form whose every action is rejected.
  if (authRequired && account && !['contributor', 'admin'].includes(account.role)) {
    return (
      <NotYourSeat title="Entry is not part of your role">
        Reporting periods are filed by the project manager for the developments assigned to
        them. Your seat validates, approves or reads what has been filed — see
        <strong> Review &amp; Approve</strong> for periods waiting on you. The server refuses
        entry for this role, so nothing here would be accepted.
      </NotYourSeat>
    );
  }

  // A PERIOD IS ONE DEVELOPMENT'S, BY DEFINITION — the same rule as the
  // workspace and the Overview. Reached standalone (the route survives for
  // links) with the selector on Corporate or a portfolio, this form used to
  // render the scope's hidden drill-in development — RES-01's budget, RES-01's
  // packages — under a heading that named no development at all, and filing it
  // moved RES-01. It asks instead, in one click. The seat refusal above comes
  // first: a person who may not enter at all is told that, whatever the scope.
  if (scope.level !== 'Project') {
    return (
      <div className="fade-up">
        <PickDevelopment what="Monthly reporting is filed for one development." />
      </div>
    );
  }

  return (
    <div className="fade-up">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>1 &amp; 2 · Development, budget and control budget</h3>
          <div className="row" style={{ gap: 12 }}>
            <span className="muted" style={{ fontSize: 11.5 }}>{`${project.id} — ${project.name}`}</span>
            {canWrite && (
              <button type="button" className="btn btn-ghost" style={{ margin: 0 }}
                disabled={downloading} onClick={downloadTemplate}>
                {Ic('download', 15)}{downloading ? 'Preparing…' : 'Download PT_TEMPLATE'}
              </button>
            )}
            <label className="btn" style={{ cursor: 'pointer', margin: 0 }}>
              {importing ? 'Reading…' : 'Import PT_TEMPLATE'}
              <input
                type="file"
                accept=".xlsx,.xlsm"
                style={{ display: 'none' }}
                disabled={importing || !canWrite}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importSheet(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <div className="card-b">
          <div className="entry-grid">
            <label>Reporting period no.
              <input value={period} onChange={(e) => { setPeriod(e.target.value); }} />
            </label>
            <label>Data date
              <input value={dataDate} placeholder="e.g. 30 September"
                onChange={(e) => { setDataDate(e.target.value); }} />
            </label>
            <label>Approved Development Budget (SAR)
              <input value={budget} onChange={(e) => { setBudget(e.target.value); }} />
            </label>
            <label>Control Budget (SAR)
              <input value={control} onChange={(e) => { setControl(e.target.value); }} />
            </label>
            <label>Anticipated Final Cost (SAR)
              <input value={afc} onChange={(e) => { setAfc(e.target.value); }} />
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>4 · Work-package register — the earned-value engine</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>
            Planned value = budget × planned %. Earned value = budget × actual %.
          </span>
        </div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>WBS</th><th>Package / scope</th><th>Budget (SAR)</th>
                <th>Planned %</th><th>Actual %</th><th>Cost incurred</th><th>Committed</th><th />
              </tr></thead>
              <tbody>
                {packages.map((p, i) => (
                  <tr key={i}>
                    <td><input className="cell" value={p.code}
                      onChange={(e) => { setPackageField(i, { code: e.target.value }); }} /></td>
                    <td><input className="cell wide" value={p.name}
                      onChange={(e) => { setPackageField(i, { name: e.target.value }); }} /></td>
                    <td><input className="cell num" value={String(p.budget)}
                      onChange={(e) => { setPackageField(i, { budget: parseMoney(e.target.value) }); }} /></td>
                    <td><input className="cell num" value={pct(p.plannedPct)}
                      onChange={(e) => { setPackageField(i, { plannedPct: parsePct(e.target.value) }); }} /></td>
                    <td><input className="cell num" value={pct(p.actualPct)}
                      onChange={(e) => { setPackageField(i, { actualPct: parsePct(e.target.value) }); }} /></td>
                    <td><input className="cell num" value={String(p.cost)}
                      onChange={(e) => { setPackageField(i, { cost: parseMoney(e.target.value) }); }} /></td>
                    <td><input className="cell num" value={String(p.committed)}
                      onChange={(e) => { setPackageField(i, { committed: parseMoney(e.target.value) }); }} /></td>
                    <td><button type="button" className="icon-btn" aria-label={`Remove package ${p.code || i + 1}`}
                      style={{ width: 26, height: 26 }}
                      onClick={() => { setPackages((r) => r.filter((_, n) => n !== i)); }}>×</button></td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td colSpan={2}><b>Total</b></td>
                  <td><b>{fmt(packages.reduce((t, p) => t + p.budget, 0))}</b></td>
                  <td /><td />
                  <td><b>{fmt(position.actual)}</b></td>
                  <td><b>{fmt(position.committed)}</b></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <button className="btn" style={{ marginTop: 10 }}
            onClick={() => { setPackages((r) => [...r, emptyPackage()]); }}>
            Add package
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h3>5 · Development cost categories</h3></div>
        <div className="card-b">
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>Category</th><th>Budget (SAR)</th><th>Committed</th>
                <th>Cost incurred</th><th>Forecast final cost</th>
              </tr></thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={i}>
                    <td><input className="cell wide" value={c.cat}
                      onChange={(e) => { setCategoryField(i, { cat: e.target.value }); }} /></td>
                    <td><input className="cell num" value={String(c.budget)}
                      onChange={(e) => { setCategoryField(i, { budget: parseMoney(e.target.value) }); }} /></td>
                    <td><input className="cell num" value={String(c.committed)}
                      onChange={(e) => { setCategoryField(i, { committed: parseMoney(e.target.value) }); }} /></td>
                    <td><input className="cell num" value={String(c.actual)}
                      onChange={(e) => { setCategoryField(i, { actual: parseMoney(e.target.value) }); }} /></td>
                    <td><input className="cell num" value={String(c.afc)}
                      onChange={(e) => { setCategoryField(i, { afc: parseMoney(e.target.value) }); }} /></td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td><b>Total</b></td>
                  <td><b>{fmt(categories.reduce((t, c) => t + c.budget, 0))}</b></td>
                  <td><b>{fmt(categories.reduce((t, c) => t + c.committed, 0))}</b></td>
                  <td><b>{fmt(categories.reduce((t, c) => t + c.actual, 0))}</b></td>
                  <td><b>{fmt(categories.reduce((t, c) => t + c.afc, 0))}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button className="btn" style={{ marginTop: 10 }}
            onClick={() => { setCategories((r) => [...r, emptyCategory()]); }}>
            Add category
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>3 · Earned-value position — calculated, not entered</h3>
        </div>
        <div className="card-b">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
            {([
              ['Planned Value (PV)', position.pv],
              ['Earned Value (EV)', position.ev],
              ['Cost Incurred (AC)', position.actual],
              ['Committed', position.committed],
            ] as const).map(([label, value]) => (
              <div className="kpi" key={label}>
                <div className="kpi-l">{`${label} (SAR)`}</div>
                <div className="kpi-v">{fmt(value)}</div>
              </div>
            ))}
          </div>

          <div className="recon-list">
            {checks.map((c) => (
              <div className={`recon-check ${c.ok ? 'ok' : 'bad'}`} key={c.label}>
                <span className={`dot ${c.ok ? 'green' : 'red'}`} />
                <span className="recon-label">{c.label}</span>
                <span className="recon-figs">{`${fmt(c.a)}  vs  ${fmt(c.b)}`}</span>
                <span className="recon-verdict">{c.ok ? 'Reconciles' : `Out by ${fmt(Math.abs(c.a - c.b))}`}</span>
              </div>
            ))}
          </div>

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              {reconciles
                ? 'Every control agrees. This period can be filed.'
                : 'This period does not reconcile and will be refused. Correct the figures above.'}
            </span>
            <button
              className="btn primary"
              disabled={busy || !reconciles || !canWrite || !periodValid}
              onClick={submit}
            >
              {busy ? 'Filing…'
                : !periodValid ? 'Period must be a whole number'
                : `File period ${period}${authRequired ? ' for validation' : ''}`}
            </button>
          </div>

          {!canWrite && (
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Your role is read-only. Periods are filed by a contributor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
