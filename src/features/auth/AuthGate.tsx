// Stands between the application and an unauthenticated visitor — but ONLY on
// the platform build.
//
// On the self-contained build `authRequired` is false and this component
// returns its children untouched, so `dist/index.html` renders exactly as it
// always has: no gate, no flash, no network request. The pixel gates prove it.
import type { ReactNode } from 'react';
import { useAuth } from '@/state/AuthProvider';
import { SignIn } from './SignIn';

export function AuthGate({ children }: { children: ReactNode }) {
  const { authRequired, account, checking } = useAuth();

  if (!authRequired) return <>{children}</>;

  // A stored token is being checked. Showing the sign-in form first would make
  // a returning user watch a login screen appear and then vanish.
  if (checking) {
    return (
      <div className="signin-page">
        <div className="signin-card" style={{ textAlign: 'center' }}>
          <p className="muted">Checking your session…</p>
        </div>
      </div>
    );
  }

  return account ? <>{children}</> : <SignIn />;
}
