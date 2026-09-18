import { useRef, useState } from 'react';
import { useAuth } from '@/state/AuthProvider';
import { useProfile } from '@/state/DataProvider';
import { Badge, Ic, toast, toastError } from '@/components';

/** The largest square we keep. A name badge, not a photograph. */
const AVATAR_PX = 256;

/**
 * Read an image file, square-crop the middle of it and shrink it to a data
 * URI small enough to live in the person's own row.
 *
 * Done in the browser on purpose. A phone photograph is several megabytes and
 * the account it belongs to needs a thumbnail; sending the original so the
 * server can throw most of it away would be the upload everybody waits for.
 */
async function toAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => { resolve(el); };
      el.onerror = () => { reject(new Error('That file could not be read as an image.')); };
      el.src = url;
    });

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('That file could not be read as an image.');

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize the picture.');
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
      0, 0, AVATAR_PX, AVATAR_PX,
    );
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The initial shown when somebody has set no picture. */
const initial = (name: string): string => name.trim()[0]?.toUpperCase() ?? '?';

/**
 * Your own account: who the system thinks you are, what you may do, and the
 * three things that are yours to change.
 *
 * Your role and your assignments are shown and not editable. They are issued
 * to you by the administrator, and a screen that let a person grant themselves
 * a role would undo the whole access model with one dropdown.
 */
export function Profile({ role }: { role: string }) {
  const { account, authRequired, signOut, refresh } = useAuth();
  const { updateProfile, changePassword } = useProfile();

  const [name, setName] = useState(account?.name ?? '');
  const [busy, setBusy] = useState<'name' | 'avatar' | 'password' | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const file = useRef<HTMLInputElement>(null);

  if (!authRequired || !account) {
    return (
      <div className="fade-up">
        <div className="card"><div className="card-b">
          <h3 style={{ fontSize: 15 }}>No account in this build</h3>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 8, maxWidth: 620 }}>
            The self-contained demonstration has no sign-in, so there is nothing here to own:
            no password to change, no picture to set and nobody to sign out as. Profiles exist
            in the hosted platform, where every action is recorded against the person who took it.
          </p>
        </div></div>
      </div>
    );
  }

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === account.name) return;
    setBusy('name');
    updateProfile({ name: trimmed })
      .then(refresh)
      .then(() => { toast('Name updated', trimmed); })
      .catch((err: unknown) => { toastError(err, 'Name not changed'); })
      .finally(() => { setBusy(null); });
  };

  const savePicture = (chosen: File | null) => {
    if (!chosen) return;
    setBusy('avatar');
    toAvatar(chosen)
      .then((avatar) => updateProfile({ avatar }))
      .then(refresh)
      .then(() => { toast('Picture updated', 'It appears beside your name across the system'); })
      .catch((err: unknown) => { toastError(err, 'Picture not changed'); })
      .finally(() => { setBusy(null); if (file.current) file.current.value = ''; });
  };

  const removePicture = () => {
    setBusy('avatar');
    updateProfile({ avatar: null })
      .then(refresh)
      .then(() => { toast('Picture removed', 'Your initial is shown instead'); })
      .catch((err: unknown) => { toastError(err, 'Picture not removed'); })
      .finally(() => { setBusy(null); });
  };

  const problem = !current ? 'Enter your current password'
    : next.length < 12 ? 'The new password must be at least 12 characters'
      : next !== confirm ? 'The two new passwords do not match'
        : next === current ? 'The new password must differ from the current one'
          : null;

  const savePassword = () => {
    if (problem) return;
    setBusy('password');
    changePassword(current, next)
      .then(() => {
        toast('Password changed', 'Use the new one next time you sign in');
        setCurrent(''); setNext(''); setConfirm('');
      })
      .catch((err: unknown) => { toastError(err, 'Password not changed'); })
      .finally(() => { setBusy(null); });
  };

  return (
    <div className="fade-up">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b">
          <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
            {account.avatar
              ? <img src={account.avatar} alt="" width={72} height={72}
                style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
              : <div className="avatar" style={{ width: 72, height: 72, fontSize: 27 }}>{initial(account.name)}</div>}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 19, fontWeight: 800 }}>{account.name}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{account.email}</div>
              <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="pill b-blue">{role}</span>
                <Badge status="Active" />
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={signOut}>
              {Ic('collapse', 15)}Sign out
            </button>
          </div>

          {account.role === 'contributor' && (
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 14 }}>
              {account.projects?.length
                ? `You may file periods and record certificates for ${account.projects.join(', ')}. Everything else in the portfolio is out of your view.`
                : 'No developments are assigned to you yet, so you can see and file nothing. Ask the administrator to assign yours.'}
            </p>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-h"><h3>Your details</h3></div>
          <div className="card-b">
            <div className="form-field full" style={{ marginBottom: 14 }}>
              <label htmlFor="profile-name">Display name</label>
              <input id="profile-name" value={name} maxLength={80}
                onChange={(e) => setName(e.target.value)} />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.6 }}>
                Shown beside everything you file, validate or approve.
              </div>
            </div>
            <button type="button" className="btn btn-primary"
              disabled={busy !== null || !name.trim() || name.trim() === account.name}
              onClick={saveName}>
              {busy === 'name' ? 'Saving…' : 'Save name'}
            </button>

            <div style={{ borderTop: '1px solid var(--line)', margin: '18px 0 14px' }} />

            <div className="kv-l" style={{ marginBottom: 8 }}>Profile picture</div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden
              onChange={(e) => { savePicture(e.target.files?.[0] ?? null); }} />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" disabled={busy !== null}
                onClick={() => file.current?.click()}>
                {Ic('upload', 15)}{busy === 'avatar' ? 'Working…' : 'Choose a picture'}
              </button>
              {account.avatar && (
                <button type="button" className="btn btn-ghost" disabled={busy !== null}
                  onClick={removePicture}>Remove</button>
              )}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
              Cropped square and shrunk in your browser before it is sent, so only a small
              thumbnail is stored. It never leaves this system.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Change your password</h3></div>
          <div className="card-b">
            <form onSubmit={(e) => { e.preventDefault(); savePassword(); }}>
              <div className="form-field full" style={{ marginBottom: 12 }}>
                <label htmlFor="pw-current">Current password</label>
                <input id="pw-current" type="password" autoComplete="current-password"
                  value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
              <div className="form-field full" style={{ marginBottom: 12 }}>
                <label htmlFor="pw-next">New password</label>
                <input id="pw-next" type="password" autoComplete="new-password"
                  value={next} onChange={(e) => setNext(e.target.value)} />
              </div>
              <div className="form-field full" style={{ marginBottom: 12 }}>
                <label htmlFor="pw-confirm">New password again</label>
                <input id="pw-confirm" type="password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {(current || next || confirm) && problem && (
                <div style={{ color: 'var(--red)', fontSize: 11.5, marginBottom: 10 }}>{problem}</div>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy !== null || problem !== null}>
                {busy === 'password' ? 'Changing…' : 'Change password'}
              </button>
            </form>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.6 }}>
              At least twelve characters. A phrase you can remember beats a short puzzle you
              cannot. Your current password is required even though you are signed in, so a
              session left open on somebody else's screen is not enough to take the account over.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
