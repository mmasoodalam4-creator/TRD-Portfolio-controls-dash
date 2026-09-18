/* eslint-disable react-refresh/only-export-components -- the hook and the row
 * belong together: they share the whitelist that keeps a hand-typed tab from
 * opening a blank panel, and splitting them across two files to satisfy fast
 * refresh would put that whitelist somewhere neither of them owns. */
import { useSearchParams } from 'react-router-dom';

/**
 * THE SUB-TAB ROW A MODULE CARRIES.
 *
 * Cost has had one since the beginning and grew its own; the approved design
 * gives one to Quality, Risk, Manpower and the rest, and thirteen copies of
 * the same eight lines is how they come to behave differently from each other.
 *
 * The active tab lives in the URL beside scope, so a view is a link — the same
 * rule the rest of this application follows. It is read from a whitelist, so a
 * hand-typed value opens the first tab rather than a blank panel, and the
 * parameter is DELETED when the first tab is selected: a URL that says
 * `?tab=register` when register is simply what you get is noise in a link
 * somebody is about to paste into a message.
 */
export function useSubTab<T extends string>(tabs: readonly T[]): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const active = (tabs as readonly string[]).includes(raw ?? '') ? (raw as T) : tabs[0];

  const set = (next: T): void => {
    setParams((prev) => {
      const q = new URLSearchParams(prev);
      if (next === tabs[0]) q.delete('tab');
      else q.set('tab', next);
      return q;
    }, { replace: true });
  };

  return [active, set];
}

export function SubTabs<T extends string>({ tabs, active, onSelect, counts }: {
  tabs: readonly T[];
  active: T;
  onSelect: (next: T) => void;
  /** Optional row count beside a tab's name, where one is meaningful. */
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          className={`tab${active === t ? ' active' : ''}`}
          aria-selected={active === t}
          onClick={() => { onSelect(t); }}
        >
          {t}
          {counts?.[t] !== undefined && <span className="tab-n">{counts[t]}</span>}
        </button>
      ))}
    </div>
  );
}
