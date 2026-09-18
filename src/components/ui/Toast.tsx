import { useState } from 'react';
import { Ic } from '../icons';

export type ToastType = 'ok' | 'err' | 'info';

interface ToastItem {
  id: number;
  title: string;
  sub?: string;
  type?: ToastType;
}

/** The stack never grows past this; the oldest goes when a new one arrives. */
const MAX_VISIBLE = 4;

// Module-level dispatch so any screen can raise a toast with a bare call,
// matching the demo's ergonomics. Replaced by context in the state phase.
let dispatch: ((t: Omit<ToastItem, 'id'>) => void) | null = null;

export const toast = (title: string, sub?: string, type?: ToastType): void => {
  dispatch?.({ title, sub, type });
};

/**
 * A toast for something that went wrong.
 *
 * Every catch block used to call `toast(err.message)`, and an untyped toast
 * is styled as SUCCESS — so a server refusing a period with the names of the
 * controls it broke appeared with a green bar and a tick. A refusal that
 * looks like a confirmation is worse than none.
 */
export const toastError = (err: unknown, title = 'That could not be done'): void => {
  const message = err instanceof Error ? err.message : String(err);
  dispatch?.({ title, sub: message, type: 'err' });
};

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>([]);

  dispatch = (t) => {
    const id = Date.now() + Math.random();
    setList((l) => {
      // The same message twice in a row says nothing the first did not.
      const last = l[l.length - 1];
      if (last && last.title === t.title && last.sub === t.sub) return l;
      return [...l, { ...t, id }].slice(-MAX_VISIBLE);
    });
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.type === 'err' ? 6000 : 3600);
  };

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.type ?? ''}`}>
          <div
            className="kpi-ic"
            style={{
              width: 30, height: 30, flexShrink: 0,
              background: t.type === 'err' ? 'var(--red-bg)'
                : t.type === 'info' ? 'var(--blue-bg)' : 'var(--green-bg)',
            }}
          >
            {Ic(
              t.type === 'err' ? 'x' : t.type === 'info' ? 'bell' : 'check', 16,
              t.type === 'err' ? 'var(--red)' : t.type === 'info' ? 'var(--blue)' : 'var(--green)',
            )}
          </div>
          <div>
            <div className="tt">{t.title}</div>
            {t.sub ? <div className="ts">{t.sub}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
