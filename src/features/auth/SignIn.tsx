// The sign-in screen.
//
// Rendered only when VITE_API_URL is set. The self-contained pitch build never
// reaches this file — see AuthProvider for why that matters.
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/state/AuthProvider';
import { tazayudLockup } from '@/assets/brand';

export function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    void signIn(email.trim(), password)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      })
      .finally(() => { setBusy(false); });
  };

  return (
    <div className="signin-page">
      <form className="signin-card" onSubmit={submit}>
        <div className="signin-brand">
          {/* The FULL lockup here, not the cropped mark. This card is the one
              light ground in the application, which is where artwork carrying
              a dark navy wordmark belongs — and this is the first screen
              anybody sees, so it is where the owner's own name should be, in
              the owner's own typeface, rather than a system font.

              It used to be drawn here as shapes, which meant replacing the
              artwork changed the sidebar and left this screen showing the old
              logo. */}
          <img className="signin-lockup" src={tazayudLockup} alt="Tazayud" />
          <div>
            <h1>Owner PMO</h1>
            <p className="muted">Integrated Portfolio &amp; Project Controls</p>
          </div>
        </div>

        <label htmlFor="signin-email">Email</label>
        <input
          id="signin-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
          placeholder="name@tazayud.com"
        />

        <label htmlFor="signin-password">Password</label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => { setPassword(e.target.value); }}
          placeholder="••••••••"
        />

        {error && <div className="signin-error" role="alert">{error}</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted signin-foot">
          Accounts are issued by the PMO. Contact your administrator for access.
        </p>
      </form>
    </div>
  );
}
