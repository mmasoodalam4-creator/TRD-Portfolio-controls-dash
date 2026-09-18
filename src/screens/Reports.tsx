import { useState } from 'react';
import type { ReportDefinition, Scope } from '@/domain/types';
import { money, mn, idx, varianceTone, varianceWord } from '@/domain/format';
import { spiOf, cpiOf } from '@/domain/calc';
import { DATA_DATE } from '@/domain/calendar';
import { useScope } from '@/state/ScopeProvider';
import { useCorporate } from '@/state/DataProvider';
import { Badge, Ic, ICONS, saveCsv, stamp, toast } from '@/components';

/**
 * Report definitions name icons the set never carried; those fell back to the
 * generic file glyph. Mapped to the nearest real icon rather than edited in
 * the fixtures, which the data layer owns.
 */
const ICON_ALIAS: Record<string, string> = { chart: 'analytics', shield: 'shield2' };
const iconOf = (name: string): string => (name in ICONS ? name : ICON_ALIAS[name] ?? 'file');

/** The colour a signed variance is printed in. Zero is neutral. */
const varianceColour = (v: number): string => {
  const t = varianceTone(v);
  return t === 'grey' ? 'var(--muted)' : `var(--${t})`;
};

/** Report centre. Generation is on-screen only in this build. */
export function Reports() {
  const { scope } = useScope();
  const { reports } = useCorporate();
  const [preview, setPreview] = useState<ReportDefinition | null>(null);

  return (
    <div className="fade-up">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b">
          <div className="between">
            <div>
              <h3 style={{ fontSize: 15 }}>Report Centre</h3>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                Preview owner-PMO reports at any scope level
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {reports.map((r, i) => (
          <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => setPreview(r)}>
            <div className="card-b">
              <div className="kpi-ic" style={{ width: 44, height: 44, background: '#E8EDF5', marginBottom: 12 }}>
                {Ic(iconOf(r.icon), 22, '#13315C')}
              </div>
              <h3 style={{ fontSize: 14 }}>{r.name}</h3>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>On-screen preview</p>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
                  onClick={(e) => { e.stopPropagation(); setPreview(r); }}>
                  {Ic('eye', 14)}Preview
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {preview && <ReportPreview report={preview} scope={scope} onClose={() => setPreview(null)} />}
    </div>
  );
}

/**
 * On-screen report proof. The executive summary is generated from the same
 * scoped aggregate every other screen reads, which is the point: the report
 * cannot disagree with the dashboard it was produced from.
 */
function ReportPreview({ report, scope, onClose }: {
  report: ReportDefinition;
  scope: Scope;
  onClose: () => void;
}) {
  const { list, totals: a } = useScope();
  // The stated data date, with its year — not the bare month name the header
  // used to print. A report that says "Aug" leaves the reader to guess which
  // August, and the registers underneath it are dated to the day.
  const dataDate = DATA_DATE;

  const variancePhrase = a.variance === 0
    ? 'in line with the Approved Development Budget'
    : `yielding ${a.variance > 0 ? 'a favourable' : 'an unfavourable'} Budget Variance of ${money(Math.abs(a.variance))}`;

  const scopeLabel = scope.level === 'Corporate' ? 'Corporate'
    : scope.level === 'Portfolio' ? scope.portfolio : scope.project;
  const slug = `${report.name} ${scopeLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /**
   * The report as a spreadsheet.
   *
   * CSV rather than .xlsx, and that is a decision rather than a shortcut: a
   * workbook WRITER has no business inside dist/index.html, which is a file
   * somebody double-clicks. Excel, Numbers and LibreOffice all open a CSV
   * directly, the figures arrive as figures, and the same button works in the
   * offline build and on the platform — which an export that needed the server
   * would not.
   *
   * The rows are the ones on screen, read from the same scoped aggregate, so
   * the file cannot disagree with the report it came from.
   */
  const exportCsv = (): void => {
    const rows: (string | number)[][] = [
      ['Tazayud Owner PMO', report.name],
      ['Scope', `${scope.level} · ${scopeLabel}`],
      ['Data date', dataDate],
      ['Generated', new Date().toISOString()],
      [],
      ['Approved Budget (SAR)', a.budget],
      ['AFC (SAR)', a.afc],
      ['Budget Variance (SAR)', a.variance],
      ['Portfolio SPI', a.spi],
      ['Portfolio CPI', a.cpi],
      [],
      ['Project', 'Name', 'Portfolio', 'Approved Budget (SAR)', 'AFC (SAR)',
        'Budget Variance (SAR)', 'SPI', 'CPI', 'Status'],
      ...list.map((p) => [
        p.id, p.name, p.portfolio, p.budget, p.afc, p.budget - p.afc,
        Number(spiOf(p).toFixed(3)), Number(cpiOf(p).toFixed(3)), p.status,
      ]),
    ];
    const filename = `tazayud-${slug}-${stamp()}.csv`;
    saveCsv(filename, rows);
    toast('Report exported', filename, 'info');
  };

  /**
   * The report as a document.
   *
   * The browser's own print dialogue, where every desktop platform offers
   * "Save as PDF". A PDF writer in the bundle would be a large dependency
   * producing a worse-looking page than the one already on screen; the print
   * stylesheet hides the application around the sheet and prints exactly what
   * the person is looking at.
   */
  const printSheet = (): void => { window.print(); };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="row" style={{ gap: 10 }}>{Ic(iconOf(report.icon), 20, '#13315C')}<h2>{report.name}</h2></div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" style={{ padding: '7px 12px' }}
              onClick={printSheet}>{Ic('download', 14)}PDF</button>
            <button className="btn btn-ghost" style={{ padding: '7px 12px' }}
              onClick={exportCsv}>{Ic('download', 14)}Excel</button>
            <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>{Ic('x', 17)}</button>
          </div>
        </div>
        <div className="modal-b">
          <div className="report-sheet"
            style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '26px 30px', background: '#fff' }}>
            <div className="between" style={{ borderBottom: '2px solid var(--navy)', paddingBottom: 14, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>TAZAYUD</div>
                <div className="muted" style={{ fontSize: 11, letterSpacing: '.1em' }}>
                  REAL ESTATE DEVELOPMENT · OWNER PMO
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{report.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {`Data Date: ${dataDate} · ${scope.level} View`}
                </div>
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
              {([
                ['Approved Budget', mn(a.budget), undefined],
                ['AFC', mn(a.afc), undefined],
                ['Budget Variance', mn(a.variance), varianceColour(a.variance)],
                ['Portfolio SPI / CPI', `${idx(a.spi)} / ${idx(a.cpi)}`, undefined],
              ] as const).map((k, i) => (
                <div key={i} style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 10 }}>
                  <div className="muted" style={{ fontSize: 10.5, fontWeight: 600 }}>{k[0]}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2, color: k[2] }}>{k[1]}</div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Executive Summary</h3>
            <p style={{ fontSize: 12.5, lineHeight: 1.7, color: '#374253', marginBottom: 18 }}>
              {`The ${scope.level.toLowerCase()} position comprises ${a.count} development${a.count === 1 ? '' : 's'} with a total Approved Development Budget of ${money(a.budget)}. `
                + `The Anticipated Final Cost stands at ${money(a.afc)}, ${variancePhrase}. `
                + `Schedule performance (Portfolio SPI ${idx(a.spi)}) and cost performance (Portfolio CPI ${idx(a.cpi)}) indicate `
                + `${a.spi >= 0.95 && a.cpi >= 0.95 ? 'projects are broadly on track' : 'areas requiring management attention'}. `
                + `${a.onTrack} on track, ${a.atRisk} at risk, ${a.delayed} delayed.`}
            </p>

            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Project Position</h3>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{['Project', 'Budget', 'AFC', 'Variance', 'SPI', 'CPI', 'Status'].map((x) => <th key={x}>{x}</th>)}</tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.id}</b></td>
                      <td>{mn(p.budget)}</td>
                      <td>{mn(p.afc)}</td>
                      <td>
                        <span style={{ color: varianceColour(p.budget - p.afc), fontWeight: 600 }}>
                          {`${mn(p.budget - p.afc)} · ${varianceWord(p.budget - p.afc)}`}
                        </span>
                      </td>
                      <td>{idx(spiOf(p))}</td>
                      <td>{idx(cpiOf(p))}</td>
                      <td><Badge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
