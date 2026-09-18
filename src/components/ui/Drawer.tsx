import { useEffect, useState, type ReactNode } from 'react';
import type { StatusLabel } from '@/domain/types';
import { Badge } from './Badge';
import { Ic } from '../icons';
import { toast } from './Toast';

/**
 * Close on Escape. Shared by every drawer and modal, so the keyboard reaches
 * all of them the same way.
 */
export function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/**
 * Right-hand detail drawer used by every register.
 *
 * `children` may be a render function receiving the active tab, which is how
 * the register screens keep tab content beside the record it belongs to.
 * Tabs are only rendered when there is something behind them — a tab whose
 * body is a placeholder is not a tab, it is a promise the screen cannot keep.
 */
export function Drawer({ title, status, tabs, onClose, children, footer }: {
  title: string;
  status?: StatusLabel;
  tabs?: string[];
  onClose: () => void;
  children: ReactNode | ((tab: string | null) => ReactNode);
  footer?: ReactNode;
}) {
  const [tab, setTab] = useState<string | null>(tabs ? tabs[0] : null);
  useEscape(onClose);
  // The drawer instance survives a change of row (it is rendered in place,
  // unkeyed), and the tab list is built per row — a variation with documents
  // has a Documents tab, one without does not. Holding a selection that is no
  // longer offered left no tab highlighted and rendered whichever panel the
  // body's if/else fell through to. The ACTIVE tab is therefore derived: the
  // selection while it is still on offer, the first tab when it is not.
  const active = tabs ? (tab !== null && tabs.includes(tab) ? tab : tabs[0]) : null;

  return (
    <div>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-h">
          <div className="row" style={{ gap: 10 }}>
            <span className="dh-id">{title}</span>
            {status && <Badge status={status} />}
          </div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close">
            {Ic('x', 17)}
          </button>
        </div>
        {tabs && tabs.length > 1 && (
          <div className="tabs" role="tablist" style={{ margin: '0 18px', padding: '0' }}>
            {tabs.map((t) => (
              <button key={t} role="tab" aria-selected={active === t} className={`tab${active === t ? ' active' : ''}`}
                onClick={() => setTab(t)} style={{ padding: '11px 12px' }}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="drawer-b">{typeof children === 'function' ? children(active) : children}</div>
        {footer && <div className="drawer-f">{footer}</div>}
      </div>
    </div>
  );
}

export type KvPair = [string, ReactNode] | [string, ReactNode, string];

/** Label/value grid used throughout the drawers. */
export function kvGrid(pairs: KvPair[]) {
  return (
    <div className="kv">
      {pairs.map((p, i) => (
        <div key={i}>
          <div className="kv-l">{p[0]}</div>
          <div className="kv-v" style={p[2] ? { color: p[2] } : {}}>{p[1]}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Attachment list. Returns null when a record has no documents.
 *
 * There is no document store behind these yet, so the row says so rather
 * than pretending to download.
 */
export function docList(docs?: string[]) {
  if (!docs || !docs.length) return null;
  return (
    <div>
      <div className="kv-l" style={{ marginBottom: 8 }}>Attachments</div>
      {docs.map((d, i) => (
        <div key={i} className="doc-link"
          onClick={() => toast('Document store not connected', `${d} is listed but not yet held here`, 'info')}>
          <span className="row" style={{ gap: 8 }}>{Ic('file', 15)}{d}</span>
          {Ic('file', 15)}
        </div>
      ))}
    </div>
  );
}
