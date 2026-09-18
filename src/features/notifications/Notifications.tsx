import { useCorporate } from '@/state/DataProvider';
import { Ic, useEscape } from '@/components';

/**
 * Alert drawer. Alerts are cost- and schedule-control events, not messages.
 *
 * `read` and `onRead` are owned by the shell, which is what makes the badge
 * on the bell a live count rather than the literal "6" it used to be, and
 * what makes "Mark all as read" actually do so.
 */
export function Notifications({ onClose, read, onRead }: {
  onClose: () => void;
  read: ReadonlySet<number>;
  onRead: (indexes: number[]) => void;
}) {
  const { notifications } = useCorporate();
  useEscape(onClose);
  const unread = notifications.map((_, i) => i).filter((i) => !read.has(i));

  return (
    <div>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Notifications" style={{ width: 380 }}>
        <div className="drawer-h">
          <div className="dh-id" style={{ fontSize: 16 }}>Notifications</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close">
            {Ic('x', 17)}
          </button>
        </div>
        <div className="drawer-b" style={{ padding: 0 }}>
          {notifications.length === 0 && (
            <p className="muted" style={{ padding: 18, fontSize: 12.5 }}>Nothing needs your attention.</p>
          )}
          {notifications.map((n, i) => (
            <div
              key={i}
              className="row"
              style={{
                gap: 12, padding: '14px 18px', borderBottom: '1px solid #eef1f6', cursor: 'pointer',
                opacity: read.has(i) ? 0.55 : 1,
              }}
              onClick={() => onRead([i])}
            >
              <span className="dot" style={{
                background: n.type === 'red' ? 'var(--red)' : n.type === 'amber' ? 'var(--amber)' : 'var(--blue)',
                width: 10, height: 10, flexShrink: 0, marginTop: 5,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{n.title}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{n.sub}</div>
              </div>
              <div className="muted" style={{ fontSize: 10.5 }}>{n.time}</div>
            </div>
          ))}
        </div>
        <div className="drawer-f">
          <button className="btn btn-ghost" style={{ flex: 1 }} disabled={unread.length === 0}
            onClick={() => { onRead(unread); onClose(); }}>
            {unread.length ? `Mark all ${unread.length} as read` : 'All read'}
          </button>
        </div>
      </div>
    </div>
  );
}
