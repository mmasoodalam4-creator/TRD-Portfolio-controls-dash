import type { ReactNode } from 'react';

/**
 * What a module says to a seat that may not open it.
 *
 * Shown by the screen itself, behind the sidebar filter that already hides
 * the module. Both are needed and neither is the enforcement: the server
 * refuses on its own, and a person who types a URL should be told why rather
 * than shown a form whose every action will be rejected.
 */
export function NotYourSeat({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fade-up">
      <div className="card"><div className="card-b">
        <h3 style={{ fontSize: 15 }}>{title}</h3>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 8, maxWidth: 660 }}>
          {children}
        </p>
      </div></div>
    </div>
  );
}
