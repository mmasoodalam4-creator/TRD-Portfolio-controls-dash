import type { ReactNode } from 'react';
import { Ic } from '../icons';

export interface FilterField {
  label: string;
  opts?: string[];
  type?: 'date';
  val?: string;
}

/**
 * Filter bar shared by every register screen.
 *
 * Controlled. It used to render selects with no value and a search box whose
 * callback no screen supplied, so thirty controls across eight registers
 * looked live and did nothing. Now every select reports its choice by label,
 * the search box reports its text, and the button clears everything — and a
 * screen that renders the bar must filter its rows with what it is told.
 */
export function Filters({ fields, search, values, onChange, onSearch, extra }: {
  fields: FilterField[];
  search?: boolean;
  /** Current choice per field label. Absent or 'All' means no filter. */
  values?: Record<string, string>;
  onChange?: (label: string, value: string) => void;
  onSearch?: (v: string) => void;
  extra?: ReactNode;
}) {
  const active = Object.values(values ?? {}).some((v) => v && v !== 'All');
  return (
    <div className="filters">
      {fields.map((f) => (
        <div className="ffield" key={f.label}>
          <label htmlFor={`filter-${f.label}`}>{f.label}</label>
          {f.type === 'date'
            ? (
              <input id={`filter-${f.label}`} type="text" placeholder={f.label}
                value={values?.[f.label] ?? f.val ?? ''}
                onChange={(e) => onChange?.(f.label, e.target.value)} />
            )
            : (
              <select id={`filter-${f.label}`} value={values?.[f.label] ?? 'All'}
                onChange={(e) => onChange?.(f.label, e.target.value)}>
                {(f.opts ?? []).map((o) => <option key={o}>{o}</option>)}
              </select>
            )}
        </div>
      ))}
      {search !== false && (
        <div className="search">
          <span className="si">{Ic('search', 16)}</span>
          <input aria-label="Search" placeholder="Search..." value={values?.__search ?? ''}
            onChange={(e) => { onChange?.('__search', e.target.value); onSearch?.(e.target.value); }} />
        </div>
      )}
      <button className="btn btn-ghost" type="button" disabled={!active && !values?.__search}
        onClick={() => {
          for (const f of fields) onChange?.(f.label, f.opts?.[0] ?? '');
          onChange?.('__search', '');
          onSearch?.('');
        }}>
        {Ic('filter', 15)}Clear
      </button>
      {extra}
    </div>
  );
}
