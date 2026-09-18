// ==========================================================================
// IDENTITY, IN THE APP
//
// The critical rule here is the one that protects the pitch deliverable:
//
//   In the self-contained build there is NO sign-in.
//
// `dist/index.html` runs on the fixtures, opens with a double-click and makes
// no network requests. Putting a login wall in front of it would break the
// thing the whole project is built to protect. So `authRequired` is false
// whenever the app is running on the mock, and every screen renders exactly as
// it always has.
//
// When VITE_API_URL is set, the app is a platform: it needs a token before it
// can read anything, because the API refuses unauthenticated requests.
// ==========================================================================
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { ALL_CAPABILITIES, NO_CAPABILITIES, type SeatCapabilities } from '@/domain/seats';
import { ApiError, setAuthToken } from '@/data/http-repository';
import { apiOrigin, apiUrl } from '@/data/repository';

/**
 * WHAT A SEAT MAY DO IS DATA, SO THE SHELL READS FLAGS AND NEVER A NAME.
 *
 * Roles moved into a table an administrator edits (migration 015) and a sixth
 * seat — the Director, who authorises changes to a development — arrived with
 * them. Every `account.role === 'approver'` in the app was a copy of a rule
 * that now lives in a row: a seat defined this morning would have been offered
 * nothing at all, and a seat whose flags were taken away would have gone on
 * being offered the buttons.
 *
 * So the capabilities travel with the account, from `/api/me` and from the
 * sign-in response, and the app asks `can.approve` rather than naming a seat.
 * This is not the enforcement — the server refuses on its own, and the
 * database refuses behind it — it is what decides which controls are worth
 * showing a person.
 */
export interface Account {
  id: string;
  email: string;
  name: string;
  /** The seat's name. A label now, not a rule — see the note above. */
  role: string;
  /** What that seat may do, as the server computed it. */
  can: SeatCapabilities;
  /** A small square data URI, or null. Set by the person on their profile. */
  avatar?: string | null;
  /** The developments a contributor may input for. Empty for everyone else. */
  projects?: string[];
}

interface AuthState {
  /** False for the self-contained build — see the note above. */
  authRequired: boolean;
  /** Null until signed in, and always null when authentication is not required. */
  account: Account | null;
  /** True while a stored token is being checked on load. */
  checking: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Re-read the signed-in account after a profile or role change. */
  refresh: () => Promise<void>;
  /** Whether this account may change data. Readers may not. */
  canWrite: boolean;
  /**
   * What the signed-in seat may do — and everything, in the self-contained
   * build, where there is no account to refuse.
   */
  can: SeatCapabilities;
}

const AuthContext = createContext<AuthState | null>(null);

/** What `/api/me` answers. Read in two places, so it is described once. */
interface MeResponse {
  sub: string;
  role: string;
  can?: SeatCapabilities;
  projects?: string[];
  profile?: { name?: string; email?: string; avatar?: string | null };
}

const accountFrom = (who: MeResponse): Account => ({
  id: who.sub,
  email: who.profile?.email ?? who.sub,
  name: who.profile?.name ?? who.sub,
  role: who.role,
  can: who.can ?? NO_CAPABILITIES,
  avatar: who.profile?.avatar ?? null,
  projects: who.projects ?? [],
});

/**
 * Where the session is kept.
 *
 * sessionStorage rather than localStorage: a shared PMO workstation should not
 * leave the owner's cost position signed in for the next person. Wrapped
 * because a `file://` page or a browser with site data blocked throws on
 * access, and the demo must still open.
 */
const TOKEN_KEY = 'tazayud.token';

const readToken = (): string | null => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const writeToken = (token: string | null): void => {
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEY);
    else sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* no session persistence available; the token lives in memory only */
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const authRequired = apiUrl !== '';
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(authRequired);

  // A stored token survives a refresh, but it may have expired while the tab
  // was closed. Ask the API who it thinks we are rather than trusting it.
  useEffect(() => {
    if (!authRequired) return;

    const token = readToken();
    if (!token) {
      setChecking(false);
      return;
    }

    setAuthToken(token);
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`${apiOrigin}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new ApiError(res.status, 'session expired');
        const who = (await res.json()) as MeResponse;
        if (!cancelled) {
          // The profile is what the shell shows. Before it was served here the
          // header read the email address back at people on every screen.
          setAccount(accountFrom(who));
        }
      } catch {
        if (!cancelled) {
          writeToken(null);
          setAuthToken(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authRequired]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${apiOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? 'Sign-in failed');
    }

    const { token, user } = (await res.json()) as {
      token: string; user: Omit<Account, 'can'> & { can?: SeatCapabilities };
    };
    writeToken(token);
    setAuthToken(token);
    // `can` is served here as well as by /api/me, so signing in does not cost
    // a second round trip before the shell knows what to offer. A deployment
    // that has not been updated omits it, and an account with no stated
    // capabilities is offered nothing rather than everything.
    setAccount({ ...user, can: user.can ?? NO_CAPABILITIES });
  }, []);

  /**
   * Re-read the signed-in account.
   *
   * Called after somebody changes their own name or picture, and after an
   * administrator changes a role, so the shell stops showing what was true a
   * moment ago without making the person sign in again.
   */
  const refresh = useCallback(async () => {
    const token = readToken();
    if (!token) return;
    const res = await fetch(`${apiOrigin}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    setAccount(accountFrom((await res.json()) as MeResponse));
  }, []);

  const signOut = useCallback(() => {
    writeToken(null);
    setAuthToken(null);
    setAccount(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    authRequired,
    account,
    checking,
    signIn,
    signOut,
    refresh,
    // On the self-contained build everything is writable, exactly as before:
    // the demo's actions must keep working with no account behind them.
    //
    // On the platform build this is the INPUT capability specifically, not a
    // general "may write": a reviewer and an approver both write, and neither
    // may enter a period.
    canWrite: !authRequired || Boolean(account?.can.input) || Boolean(account?.can.administer),
    // Everything offline: there is no account there, so there is nobody to
    // refuse and nothing to hide. On the platform it is the seat's own flags.
    can: authRequired ? account?.can ?? NO_CAPABILITIES : ALL_CAPABILITIES,
  }), [authRequired, account, checking, signIn, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
