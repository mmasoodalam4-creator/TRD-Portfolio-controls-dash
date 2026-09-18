// ==========================================================================
// MESSAGES
//
// Deliberately NOT part of the data snapshot.
//
// The snapshot is the reported position: the developments, their registers and
// the corporate reference data. It is what every screen reads and what the
// reconciliation controls run over. A message moves no figure, so putting it
// in there would make every load of the position carry a conversation, and
// every new message invalidate the position — two things that have nothing to
// do with each other, refreshed together.
//
// So messages have their own small state and their own poll.
//
// POLLING, AND WHY IT IS NOT A SOCKET
//
// The API runs as a serverless function. There is no long-lived process to
// hold a WebSocket open, and adding one would mean a second piece of
// infrastructure, a second thing to secure and a second thing to pay for —
// for a system where six people discuss a monthly reporting cycle. Polling is
// the right shape here, and the cost is bounded by keeping it to ONE request:
//
//   * the inbox refreshes every 60 seconds while the app is open,
//   * the open conversation refreshes every 20 seconds, and only while it is
//     actually open,
//   * both stop entirely while the tab is hidden, because a laptop shut on a
//     desk should not be billing invocations all weekend,
//   * and a POLL NEVER WRITES.
//
// Those intervals were 25 and 8 seconds, and on the deployment that produced
// FUNCTION_INVOCATION_TIMEOUT. A serverless invocation that arrives when no
// instance is warm pays a cold start AND a fresh Postgres connect through the
// pooler before it does any work; at eight-second intervals a share of those
// simply do not finish inside the function's limit. The cost of a slower poll
// is that a message can be up to twenty seconds late. The cost of the faster
// one was an error toast in front of somebody trying to type.
//
// In the self-contained build there are no accounts, `authRequired` is false,
// and the poll never starts at all: the offline deliverable makes no network
// requests, and that is not negotiable.
// ==========================================================================
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { repository } from '@/data/repository';
import type { Correspondent, Inbox, Message } from '@/data/repository';

// Re-exported so screens never reach into the data layer for a type. The
// import rule that forbids it is not pedantry: it is what keeps every screen
// reading through this seam, and so what makes the fixtures swappable for an
// API without a screen knowing.
export type { Correspondent, Message } from '@/data/repository';
import { useAuth } from './AuthProvider';

const INBOX_EVERY = 60_000;
const THREAD_EVERY = 20_000;

interface MessagesState {
  /** Everyone who can be written to, most recent conversation first. */
  people: Correspondent[];
  /** Unread across every conversation — what the badge in the shell shows. */
  unread: number;
  /** Whether this build has anybody to write to at all. */
  available: boolean;
  loading: boolean;
  error: string | null;
  /** Read one conversation and mark it read. */
  /** `mark` false for a poll: a poll must never write. */
  openConversation: (withId: string, mark?: boolean) => Promise<Message[]>;
  send: (to: string, body: string, projectId: string | null) => Promise<Message>;
  refresh: () => Promise<void>;
}

const MessagesContext = createContext<MessagesState | null>(null);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { authRequired, account } = useAuth();
  const available = authRequired && account !== null;

  const [people, setPeople] = useState<Correspondent[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A poll that overlaps its predecessor stacks invocations on a slow
  // connection, which is exactly when you least want more of them.
  const inFlight = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!available || inFlight.current) return;
    inFlight.current = true;
    try {
      const got: Inbox = await repository.getInbox();
      setPeople(got.people);
      setUnread(got.unread);
      setError(null);
    } catch (e: unknown) {
      // A failed poll is not a failed anything. The last inbox stays on
      // screen and the next tick tries again; replacing it with an error
      // would blank a conversation somebody is reading because one request
      // out of every hundred lost the connection.
      setError(e instanceof Error ? e.message : 'Messages could not be refreshed');
    } finally {
      inFlight.current = false;
    }
  }, [available]);

  useEffect(() => {
    if (!available) {
      setPeople([]);
      setUnread(0);
      return undefined;
    }
    setLoading(true);
    void refresh().finally(() => { setLoading(false); });

    const tick = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(tick, INBOX_EVERY);
    // Coming back to the tab should show the current state at once rather
    // than up to twenty-five seconds later.
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [available, refresh]);

  /**
   * Read one conversation.
   *
   * `mark` is false for a POLL and true when somebody actually opens the
   * thread. A poll that marked messages read would issue an UPDATE to the
   * database every twenty seconds, per open conversation, per person, for as
   * long as the tab is open — writing constantly to record a fact that was
   * already recorded the first time.
   *
   * It does NOT depend on `people`. It used to, to work out how much to take
   * off the badge, and `people` is a new array after every inbox poll — so
   * this function changed identity every minute, which re-fired the caller's
   * effect, which re-fetched the thread and reset its timer. The functional
   * update below reads the current value without depending on it.
   */
  const openConversation = useCallback(async (
    withId: string, mark = true,
  ): Promise<Message[]> => {
    if (!available) return [];
    const got = await repository.getConversation(withId, mark);
    if (!mark) return got;
    // Reading a conversation clears its unread count server-side, so the
    // badge is corrected here without waiting for the next inbox poll.
    setPeople((prev) => {
      const had = prev.find((p) => p.id === withId)?.unread ?? 0;
      if (had > 0) setUnread((n) => Math.max(0, n - had));
      return prev.map((p) => (p.id === withId ? { ...p, unread: 0 } : p));
    });
    return got;
  }, [available]);

  const send = useCallback(async (
    to: string, body: string, projectId: string | null,
  ): Promise<Message> => {
    const sent = await repository.sendMessage(to, body, projectId);
    void refresh();
    return sent;
  }, [refresh]);

  const value = useMemo<MessagesState>(() => ({
    people, unread, available, loading, error, openConversation, send, refresh,
  }), [people, unread, available, loading, error, openConversation, send, refresh]);

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages(): MessagesState {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages outside MessagesProvider');
  return ctx;
}

/** How often an open conversation re-reads itself. */
export const CONVERSATION_POLL_MS = THREAD_EVERY;
