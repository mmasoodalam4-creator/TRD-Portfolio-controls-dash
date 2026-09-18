import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageId } from '@/app/types';
import { useAuth } from '@/state/AuthProvider';
import { useProjects } from '@/state/DataProvider';
import { CONVERSATION_POLL_MS, useMessages, type Message } from '@/state/MessagesProvider';
import { Ic, toastError } from '@/components';

/** The seat, as a person recognises it rather than as the database spells it. */
const SEAT: Record<string, string> = {
  contributor: 'Project Manager / PMC',
  reviewer: 'Data Reviewer',
  approver: 'PMO Manager / Director',
  reader: 'Executive Viewer',
  admin: 'Administrator',
};

/** "14:32" for today, "4 Sep 14:32" for anything older. */
function when(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${at.getDate()} ${at.toLocaleString([], { month: 'short' })} ${time}`;
}

/** The day a run of messages belongs to, as a separator. */
function day(iso: string): string {
  const at = new Date(iso);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (at.toDateString() === today) return 'Today';
  if (at.toDateString() === yesterday) return 'Yesterday';
  return at.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Direct messages between the people who report, review and approve.
 *
 * The system already records what everybody DID — who filed a period, who
 * validated it, who approved it, who amended a development and why. What it
 * had nowhere to put is the conversation AROUND that: a project manager asking
 * the PMO manager whether a variation will be approved before the period
 * closes, the administrator saying an assignment has changed. Until now that
 * happened somewhere else, which means the reasoning behind a figure lived on
 * somebody's phone and left the company when they did.
 *
 * A message is not a mutation. It moves no figure, so it is not in the change
 * log, not replayed, and not put through the reconciliation controls — and it
 * is not editable or deletable either, for the same reason an account that has
 * acted is withdrawn rather than erased. "I told you about that in March" is
 * exactly the claim this screen exists to settle.
 *
 * A message may name a development. That is a REFERENCE, not a link into the
 * data: it says what the conversation is about and jumps the reader there.
 */
export function Messages({ nav, openProject }: {
  nav: (page: PageId) => void;
  openProject: (projectId: string) => void;
}) {
  const { account } = useAuth();
  const { people, available, loading, error, openConversation, send } = useMessages();
  const projects = useProjects();

  const [withId, setWithId] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  // A poll that failed. Said quietly at the foot of the conversation rather
  // than as an error, because nothing has gone wrong for the person reading.
  const [stale, setStale] = useState(false);
  const foot = useRef<HTMLDivElement>(null);

  const other = people.find((p) => p.id === withId) ?? null;

  /**
   * Read the conversation.
   *
   * `opening` separates the two reasons this runs, and they fail differently.
   *
   * OPENING is something the person did, so a failure is theirs to see. It
   * also marks what the other person sent as read.
   *
   * POLLING is something the screen does on its own, every twenty seconds,
   * and a failure is NOT an event in the person's day. The last thread stays
   * on screen and the next tick tries again. Throwing a red toast in front of
   * somebody mid-sentence because one request out of a hundred timed out is
   * how a working feature comes to look broken — which is exactly what a
   * FUNCTION_INVOCATION_TIMEOUT on a cold serverless instance produced.
   *
   * A poll also never writes: see `openConversation`.
   */
  const load = useCallback(async (id: string, opening: boolean): Promise<void> => {
    try {
      setThread(await openConversation(id, opening));
      setStale(false);
    } catch (e: unknown) {
      if (opening) toastError(e, 'The conversation could not be read');
      else setStale(true);
    }
  }, [openConversation]);

  // Open the first conversation there is, so the screen is never an empty
  // panel beside a list somebody then has to click.
  useEffect(() => {
    if (withId === null && people.length > 0) setWithId(people[0].id);
  }, [people, withId]);

  useEffect(() => {
    if (!withId) return undefined;
    void load(withId, true);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(withId, false);
    }, CONVERSATION_POLL_MS);
    return () => { window.clearInterval(timer); };
  }, [withId, load]);

  // Follow the conversation down as it grows, the way a chat is read.
  useEffect(() => { foot.current?.scrollIntoView({ block: 'end' }); }, [thread.length, withId]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q)
      || (SEAT[p.role] ?? p.role).toLowerCase().includes(q));
  }, [people, search]);

  const submit = (): void => {
    const text = draft.trim();
    if (!text || !withId || busy) return;
    setBusy(true);
    send(withId, text, about || null)
      .then((sent) => {
        // Appended rather than re-fetched: the message is already recorded,
        // and waiting a round trip to see your own words is what makes a
        // chat feel broken.
        setThread((prev) => [...prev, sent]);
        setDraft('');
        setAbout('');
      })
      .catch((e: unknown) => { toastError(e, 'The message was not sent'); })
      .finally(() => { setBusy(false); });
  };

  // ---- the self-contained build ---------------------------------------
  //
  // No accounts means nobody to write to. Said plainly, because a scripted
  // conversation between people who do not exist would be the one thing on
  // this screen a person could not tell apart from the real product.
  if (!available) {
    return (
      <div className="card">
        <div className="card-b empty-panel">
          <div className="empty-mark">{Ic('message', 26)}</div>
          <h3>Messaging needs the hosted platform</h3>
          <p>
            This is the self-contained build: it opens from a file, makes no network requests and
            has no accounts — so there is nobody to write to. On the hosted platform every signed-in
            person can message any other, and a conversation may name the development it is about.
          </p>
          <p className="muted" style={{ fontSize: 11.5 }}>
            Messages are kept as a permanent record. They are never edited and never deleted, and
            they never move a figure: everything that changes the reported position still goes
            through Period Entry, Review &amp; Approve and the reconciliation controls.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="msg-wrap">
      {/* ---- who ------------------------------------------------------ */}
      <div className="card msg-people">
        <div className="card-h">
          <h3>People</h3>
          <span className="muted" style={{ fontSize: 11.5 }}>{`${people.length}`}</span>
        </div>
        <div className="msg-search">
          <input value={search} placeholder="Search by name or seat"
            aria-label="Search people" onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="msg-list">
          {shown.map((p) => (
            <button key={p.id} type="button"
              className={`msg-person${p.id === withId ? ' on' : ''}`}
              onClick={() => { setWithId(p.id); setDraft(''); setAbout(''); }}>
              {p.avatar
                ? <img className="avatar sm" src={p.avatar} alt="" width={32} height={32} />
                : <div className="avatar sm" aria-hidden="true">{p.name[0]}</div>}
              <div className="msg-person-t">
                <div className="msg-person-n">
                  <span>{p.name}</span>
                  {p.unread > 0 && <span className="msg-unread">{p.unread}</span>}
                </div>
                <div className="msg-person-s">{SEAT[p.role] ?? p.role}</div>
                {p.lastBody && (
                  <div className="msg-person-l">
                    {p.lastFromMe ? 'You: ' : ''}{p.lastBody}
                  </div>
                )}
              </div>
              {!p.active && <span className="pill b-grey">Withdrawn</span>}
            </button>
          ))}
          {shown.length === 0 && (
            <div className="muted" style={{ padding: 16, fontSize: 12 }}>
              {loading ? 'Reading the directory…' : 'Nobody matches that.'}
            </div>
          )}
        </div>
        {error && (
          <div className="msg-offline" title={error}>
            {Ic('warning', 13)} Showing the last known state; reconnecting.
          </div>
        )}
      </div>

      {/* ---- the conversation ----------------------------------------- */}
      <div className="card msg-thread">
        {other ? (
          <>
            <div className="card-h">
              <div>
                <h3>{other.name}</h3>
                <span className="muted" style={{ fontSize: 11.5 }}>{SEAT[other.role] ?? other.role}</span>
              </div>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {thread.length === 0 ? 'No messages yet'
                  : `${thread.length} message${thread.length === 1 ? '' : 's'}`}
              </span>
            </div>

            <div className="msg-body">
              {thread.length === 0 && (
                <div className="muted" style={{ textAlign: 'center', padding: 28, fontSize: 12.5 }}>
                  {`Nothing has been said between you and ${other.name} yet.`}
                </div>
              )}
              {thread.map((m, i) => {
                const mine = m.from === account?.id;
                const newDay = i === 0 || day(m.at) !== day(thread[i - 1].at);
                const known = m.projectId !== null
                  && projects.some((p) => p.id === m.projectId);
                return (
                  <div key={m.id}>
                    {newDay && <div className="msg-day"><span>{day(m.at)}</span></div>}
                    <div className={`msg-row${mine ? ' mine' : ''}`}>
                      <div className="msg-bubble">
                        {m.projectId && (
                          <button type="button" className="msg-about" disabled={!known}
                            title={known ? `Open ${m.projectId}` : `${m.projectId} is no longer in the portfolio`}
                            onClick={() => { if (known) openProject(m.projectId as string); }}>
                            {Ic('projects', 12)}{m.projectId}
                          </button>
                        )}
                        <div className="msg-text">{m.body}</div>
                        <div className="msg-at">{when(m.at)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={foot} />
            </div>

            {stale && (
              <div className="msg-offline" title="The last refresh did not come back">
                {Ic('warning', 13)} Showing the last messages received; reconnecting.
              </div>
            )}

            {other.active ? (
              <form className="msg-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <select value={about} aria-label="Which development is this about?"
                  onChange={(e) => setAbout(e.target.value)}>
                  <option value="">No development</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
                <textarea rows={2} value={draft} maxLength={4000}
                  placeholder={`Message ${other.name}…  (Enter to send, Shift+Enter for a new line)`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                  }} />
                <button type="submit" className="btn btn-gold" disabled={busy || !draft.trim()}>
                  {Ic('check', 15)}{busy ? 'Sending…' : 'Send'}
                </button>
              </form>
            ) : (
              <div className="msg-compose closed">
                {`${other.name} has been withdrawn and can no longer sign in. `}
                The conversation is kept as part of the record.
              </div>
            )}
          </>
        ) : (
          <div className="card-b empty-panel">
            <div className="empty-mark">{Ic('message', 26)}</div>
            <h3>No one to write to yet</h3>
            <p>
              Accounts are created on the Administration screen. Once there is somebody else on the
              system, they appear here.
            </p>
            {account?.role === 'admin' && (
              <button type="button" className="btn btn-ghost" onClick={() => nav('admin')}>
                {Ic('admin', 15)}Open Administration
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
