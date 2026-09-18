import { useState } from 'react';
import { fmt } from '@/domain/format';
import { integrityReport } from '@/domain/integrity';
import { useScope } from '@/state/ScopeProvider';
import { useCorporate, useRegistersFor } from '@/state/DataProvider';
import { Ic, saveCsv, stamp, toast, useEscape } from '@/components';

/**
 * Data integrity and reconciliation — the second hero flow, and the demo's
 * strongest claim.
 *
 * Every control reads two independent places in the live data and compares
 * them, across every development in scope, on every render — there is no
 * cached result to re-run. It used to render a fixed array of pairs that were
 * equal because they had been written that way: control 8 asserted 38,450
 * workforce hours against 38,450 exposure hours while the manpower register
 * totalled 40,280.
 */
export function Integrity({ onClose }: { onClose: () => void }) {
  const { list, scope } = useScope();
  const { months, scurve } = useCorporate();
  const registersFor = useRegistersFor();
  const [sel, setSel] = useState<number | null>(null);
  useEscape(onClose);

  const report = integrityReport(list, registersFor, months, scurve);
  const allPassed = report.passed === report.total;

  const unit = (value: number, u: string) =>
    (u === 'SAR' ? `${fmt(value)} SAR` : u === 'hours' ? `${fmt(value)} hrs` : fmt(value));

  /** The report as a CSV file, produced in the browser — nothing leaves the machine. */
  const exportReport = () => {
    const filename = `integrity-report-${stamp()}.csv`;
    saveCsv(filename, [
      ['Control', 'Name', 'Source A', 'Value A', 'Source B', 'Value B', 'Unit', 'Result', 'Passing', 'Developments'],
      ...report.controls.map((c) => [
        c.no, c.name, c.sourceA, c.a, c.sourceB, c.b, c.unit, c.result, c.passing, c.projects,
      ]),
      [],
      ['Scope', `${scope.level}${scope.level === 'Corporate' ? '' : ` · ${scope.level === 'Portfolio' ? scope.portfolio : scope.project}`}`],
      ['Developments', list.map((p) => p.id).join(' ')],
      ['Passed', `${report.passed} of ${report.total}`],
      ['Generated', new Date().toISOString()],
    ]);
    toast('Report exported', filename, 'info');
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="integrity-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="row" style={{ gap: 10 }}>
            {Ic('shield2', 20, allPassed ? '#1E9E5A' : '#D24141')}
            <h2 id="integrity-title">Data Integrity &amp; Reconciliation Engine</h2>
          </div>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Close" onClick={onClose}>{Ic('x', 17)}</button>
        </div>

        <div className="modal-b">
          <div
            className="big-status"
            style={allPassed ? undefined : {
              background: 'linear-gradient(135deg,var(--red-bg),#f7d5d5)', borderColor: '#eab4b4',
            }}
          >
            <div className="kpi-ic" style={{ width: 52, height: 52, background: '#fff' }}>
              {Ic(allPassed ? 'check' : 'alert', 30, allPassed ? 'var(--green)' : 'var(--red)')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: allPassed ? '#1a7a49' : '#9c2b2b' }}>
                {`${report.passed} / ${report.total} CONTROLS PASSED`}
              </div>
              <div style={{ fontSize: 12.5, color: allPassed ? '#2b7a52' : '#9c2b2b' }}>
                {allPassed
                  ? `Every control reconciles across ${report.projects} development${report.projects === 1 ? '' : 's'} in scope. Data is safe to report.`
                  : `${report.total - report.passed} control${report.total - report.passed === 1 ? '' : 's'} disagree. Resolve before reporting.`}
              </div>
            </div>
          </div>

          <div className="muted" style={{ fontSize: 11.5, margin: '12px 2px 10px' }}>
            Each control compares two independently sourced figures and is evaluated live against
            the current position. Select a row for its sources.
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {report.controls.map((c, i) => {
              const ok = c.result === 'OK';
              return (
                <div key={c.no} className="recon-row" style={{ cursor: 'pointer' }} role="button" tabIndex={0}
                  aria-expanded={sel === i}
                  onClick={() => setSel(sel === i ? null : i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(sel === i ? null : i); } }}>
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      background: ok ? 'var(--green-bg)' : 'var(--red-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {Ic(ok ? 'check' : 'x', 14, ok ? 'var(--green)' : 'var(--red)')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{`Control ${c.no}: ${c.name}`}</div>
                      {sel === i && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.7 }}>
                          <div>{`${c.sourceA}: ${unit(c.a, c.unit)}`}</div>
                          <div>{`${c.sourceB}: ${unit(c.b, c.unit)}`}</div>
                          <div>{`Difference: ${unit(Math.abs(c.a - c.b), c.unit)} · passing on ${c.passing} of ${c.projects} development${c.projects === 1 ? '' : 's'}`}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${ok ? 'b-green' : 'b-red'}`}>{ok ? 'OK' : 'MISMATCH'}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={exportReport}>
            {Ic('download', 15)}Export Report (CSV)
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
