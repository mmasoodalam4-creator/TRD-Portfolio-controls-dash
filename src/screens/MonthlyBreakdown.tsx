import type { MonthlyCostPoint } from '@/domain/forecast';
import { DATA_DATE_INDEX } from '@/domain/forecast';
import { fmt, idx } from '@/domain/format';
import { Info } from '@/components';
import type { ScopePosition } from '@/domain/position';

/** A cell that is not a figure yet. */
const DASH = <span className="mb-dash">—</span>;

/** Cumulative index, or null where the month has not been reported. */
const ratio = (a: number | null, b: number | null): number | null =>
  (a === null || b === null || b === 0 ? null : a / b);

/**
 * The development month by month, in the shape a controls reviewer reads it:
 * one row per measure, one column per month.
 *
 * Cumulative figures run the whole year; the in-month movement is what the
 * curve above draws. Everything to the right of the data date is FORECAST —
 * planned value continues because the baseline says what should happen, and
 * earned value and actual cost stop because nothing has been reported yet.
 * Showing a number there would be inventing one, so those cells are empty and
 * the header says which month is the data date.
 *
 * The description column is sticky and the rest scrolls, because twelve months
 * of nine-figure amounts do not fit a laptop and a table that pushes the page
 * sideways reads as unfinished.
 */
export function MonthlyBreakdown({ p, rows }: { p: ScopePosition; rows: MonthlyCostPoint[] }) {
  const dd = Math.min(DATA_DATE_INDEX, rows.length - 1);
  const reported = (i: number): boolean => i <= dd;

  const money = (v: number | null): React.ReactNode => (v === null ? DASH : fmt(v));

  const measures: [React.ReactNode, (r: MonthlyCostPoint, i: number) => React.ReactNode, string][] = [
    [<>Planned Value (SAR) <Info term="pv" /></>, (r) => fmt(r.plannedCum), 'Cumulative, from the baseline'],
    [<>Earned Value (SAR) <Info term="ev" /></>, (r) => money(r.earnedCum), 'Cumulative, from reported progress'],
    [<>Actual Cost (SAR) <Info term="actual" /></>, (r) => money(r.actualCum), 'Cumulative cost incurred'],
    ['Cost this month (SAR)', (r) => money(r.actualMonth), 'Movement within the month'],
  ];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-h">
        <h3>Monthly breakdown</h3>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {`${p.id} · reported to ${rows[dd]?.month ?? '—'}; later months are the baseline forecast`}
        </span>
      </div>
      <div className="card-b">
        <div className="tbl-wrap">
          <table className="mbt">
            <thead>
              <tr>
                <th className="mb-desc">Description</th>
                {rows.map((r, i) => (
                  <th key={r.month} className={`num${i === dd ? ' mb-now' : ''}`}>
                    {i === dd ? <span className="mb-now-tag">{r.month}</span> : r.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {measures.map(([label, cell, note]) => (
                <tr key={note}>
                  <th className="mb-desc" scope="row">
                    <span className="mb-label">{label}</span>
                    <span className="mb-note">{note}</span>
                  </th>
                  {rows.map((r, i) => (
                    <td key={r.month} className={`num${i === dd ? ' mb-now' : ''}${reported(i) ? '' : ' mb-fore'}`}>
                      {cell(r, i)}
                    </td>
                  ))}
                </tr>
              ))}

              <tr className="mb-band">
                <th className="mb-desc" scope="row">
                  <span className="mb-label">Reported</span>
                  <span className="mb-note">A month closes when its period is approved</span>
                </th>
                {rows.map((r, i) => (
                  <td key={r.month} className={`num${i === dd ? ' mb-now' : ''}`}>
                    <span className={`mb-dot${reported(i) ? ' on' : ''}`} aria-label={reported(i) ? 'Reported' : 'Not yet reported'} />
                  </td>
                ))}
              </tr>

              <tr>
                <th className="mb-desc" scope="row">
                  <span className="mb-label">SPI <Info term="spi" /></span>
                  <span className="mb-note">Earned value over planned, cumulative</span>
                </th>
                {rows.map((r, i) => {
                  const v = ratio(r.earnedCum, r.plannedCum);
                  return (
                    <td key={r.month} className={`num${i === dd ? ' mb-now' : ''}`}>
                      {v === null ? DASH
                        : <span className={`mb-pill ${v >= 1 ? 'ok' : v >= 0.9 ? 'warn' : 'bad'}`}>{idx(v)}</span>}
                    </td>
                  );
                })}
              </tr>

              <tr>
                <th className="mb-desc" scope="row">
                  <span className="mb-label">CPI <Info term="cpi" /></span>
                  <span className="mb-note">Earned value over actual cost, cumulative</span>
                </th>
                {rows.map((r, i) => {
                  const v = ratio(r.earnedCum, r.actualCum);
                  return (
                    <td key={r.month} className={`num${i === dd ? ' mb-now' : ''}`}>
                      {v === null ? DASH
                        : <span className={`mb-pill ${v >= 1 ? 'ok' : v >= 0.9 ? 'warn' : 'bad'}`}>{idx(v)}</span>}
                    </td>
                  );
                })}
              </tr>

              <tr>
                <th className="mb-desc" scope="row">
                  <span className="mb-label">Position</span>
                  <span className="mb-note">What each column is</span>
                </th>
                {rows.map((r, i) => (
                  <td key={r.month} className={`num${i === dd ? ' mb-now' : ''}`}>
                    <span className={`mb-tag ${reported(i) ? 'rep' : 'fore'}`}>
                      {i < dd ? 'Closed' : i === dd ? 'Data date' : 'Forecast'}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 12 }}>
          Planned value runs the whole period because the baseline says what should happen. Earned
          value and actual cost stop at the data date, because nothing beyond it has been reported —
          a figure there would be invented rather than measured. SPI and CPI are computed from the
          three rows above them on this screen, never read from a stored field.
        </p>
      </div>
    </div>
  );
}
