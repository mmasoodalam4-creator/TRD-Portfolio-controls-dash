import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccountSummary, Seat } from '@/state/DataProvider';
import { useAccounts, useProjects, useSeats } from '@/state/DataProvider';
import { useAuth } from '@/state/AuthProvider';
import { Badge, Ic, toast, toastError } from '@/components';

// THE SEATS ARE READ, NOT LISTED HERE.
//
// This screen used to carry its own table of five roles with its own titles
// and its own one-line descriptions. `db/migrations/015` made seats rows an
// administrator edits and added a sixth, so that table became a restatement
// of the database that could disagree with it — and would have, the first
// time somebody defined a seat and found this dropdown had never heard of it.

const titleOf = (seats: Seat[], role: string): string =>
  seats.find((s) => s.role === role)?.title ?? role;

/**
 * Whether a seat files figures, and so needs developments assigned to it.
 *
 * Read from the seat's own `input` flag rather than by testing for the name
 * `contributor`: absence of an assignment is absence of permission, and a new
 * seat that may input would otherwise be issued with nothing assigned and no
 * way on this screen to assign anything.
 */
const filesFigures = (seats: Seat[], role: string): boolean =>
  Boolean(seats.find((s) => s.role === role)?.can.input);

/** "04 Sep 2026" — one format, whatever the browser's locale. */
const day = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * A password nobody has to invent.
 *
 * Four words and a number beats a short puzzle: it is long, it can be read
 * down a telephone, and the person can retype it without a second attempt.
 * Generated in the browser from crypto.getRandomValues, shown once, and never
 * stored anywhere but as a hash.
 */
const WORDS = [
  'harbour', 'granite', 'lantern', 'meadow', 'compass', 'thistle', 'crimson', 'juniper',
  'marble', 'saffron', 'quarry', 'willow', 'cobalt', 'ember', 'falcon', 'orchard',
];
function suggestPassword(): string {
  const pick = new Uint32Array(5);
  crypto.getRandomValues(pick);
  const words = [...pick.slice(0, 4)].map((n) => WORDS[n % WORDS.length]);
  return `${words.join('-')}-${(pick[4] % 90) + 10}`;
}

/**
 * Accounts, for the one role that may issue them.
 *
 * Everything here goes through the API, and the API refuses anyone who is not
 * an administrator — the screen hides what it would refuse, it does not
 * enforce it. Three rules are worth knowing because the server states them
 * back when it declines: you cannot change your own role or withdraw your own
 * account, the last administrator cannot be removed, and an account that has
 * filed or approved anything is withdrawn rather than erased, so the audit
 * trail keeps pointing at somebody real.
 */
export function Accounts() {
  const accounts = useAccounts();
  const projects = useProjects();
  const { seats } = useSeats();
  const { account: me } = useAuth();

  const [rows, setRows] = useState<AccountSummary[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AccountSummary | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(() => {
    accounts.list()
      .then((list) => { setRows(list); setFailed(null); })
      .catch((err: unknown) => { setFailed(err instanceof Error ? err.message : String(err)); });
  }, [accounts]);

  useEffect(() => { load(); }, [load]);

  const run = (id: string, work: Promise<unknown>, done: string, sub = '') => {
    setBusy(id);
    work
      .then(() => { toast(done, sub); load(); })
      .catch((err: unknown) => { toastError(err, 'That change was refused'); })
      .finally(() => { setBusy(null); });
  };

  const counts = useMemo(() => {
    const active = (rows ?? []).filter((r) => r.active);
    return { total: rows?.length ?? 0, active: active.length, admins: active.filter((r) => r.role === 'admin').length };
  }, [rows]);

  if (failed) {
    return (
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        {`Accounts could not be listed: ${failed}. Only an administrator may manage accounts.`}
      </p>
    );
  }

  if (!rows) return <p className="muted" style={{ fontSize: 12.5 }}>Loading accounts…</p>;

  return (
    <div>
      <div className="between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 14 }}>System accounts</h3>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {`${counts.active} active of ${counts.total}, ${counts.admins} administrator${counts.admins === 1 ? '' : 's'}`}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          {Ic('plus', 15)}Add user
        </button>
      </div>

      {issued && (
        <div className="card" style={{ marginBottom: 14, background: 'var(--amber-bg)', borderColor: '#f0d9ae' }}>
          <div className="card-b">
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{`Password for ${issued.email}`}</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 15, margin: '8px 0', userSelect: 'all' }}>
              {issued.password}
            </div>
            <div style={{ fontSize: 12, color: '#7a5a1f', lineHeight: 1.6 }}>
              Shown once and never again, because only a hash of it is kept. Send it to them over
              something private and ask them to change it under their own profile.
            </div>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }}
              onClick={() => setIssued(null)}>I have sent it</button>
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>{['Name', 'Role', 'Email', 'Developments', 'Last seen', 'Status', 'Actions']
              .map((x) => <th key={x}>{x}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <div className="row" style={{ gap: 9 }}>
                      {u.avatar
                        ? <img className="avatar" src={u.avatar} alt="" width={30} height={30}
                          style={{ width: 30, height: 30 }} />
                        : <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                          {u.name[0]?.toUpperCase() ?? '?'}
                        </div>}
                      <div>
                        <b>{u.name}</b>
                        {isMe && <span className="muted" style={{ fontSize: 11 }}> · you</span>}
                      </div>
                    </div>
                  </td>
                  <td><span className="pill b-blue">{titleOf(seats, u.role)}</span></td>
                  <td>{u.email}</td>
                  <td className="muted">{u.projects.length ? u.projects.join(' ') : '—'}</td>
                  <td className="muted">{day(u.lastSeenAt)}</td>
                  <td><Badge status={u.active ? 'Active' : 'Withdrawn'} /></td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '6px 11px' }}
                        disabled={busy !== null} onClick={() => setEditing(u)}>Manage</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 14 }}>
        An account that has filed, validated or approved anything is withdrawn rather than
        erased, so the audit trail keeps naming somebody real. A withdrawn account cannot sign
        in and keeps everything it did. You cannot change your own role or withdraw yourself,
        and the last administrator cannot be removed.
      </p>

      {adding && (
        <AddAccount
          seats={seats}
          onClose={() => setAdding(false)}
          onCreated={(email, password) => { setIssued({ email, password }); setAdding(false); load(); }}
        />
      )}

      {editing && (
        <ManageAccount
          user={editing}
          seats={seats}
          isMe={editing.id === me?.id}
          projects={projects.map((p) => p.id)}
          busy={busy !== null}
          onClose={() => setEditing(null)}
          onRun={(work, done, sub) => { run(editing.id, work, done, sub); setEditing(null); }}
          onPasswordSet={(email, password) => { setIssued({ email, password }); setEditing(null); }}
        />
      )}
    </div>
  );
}

/** Issue a new account: an address, a name, a role and a password shown once. */
function AddAccount({ seats, onClose, onCreated }: {
  seats: Seat[];
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const accounts = useAccounts();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('contributor');
  const [password, setPassword] = useState(suggestPassword);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const problem = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address'
    : !name.trim() ? 'Enter the person’s name'
      : password.length < 12 ? 'The password must be at least 12 characters'
        : null;

  const submit = () => {
    setTried(true);
    if (problem || busy) return;
    setBusy(true);
    accounts.create({ email: email.trim().toLowerCase(), name: name.trim(), role, password })
      .then((created) => { onCreated(created.email, password); })
      .catch((err: unknown) => { toastError(err, 'The account was not created'); setBusy(false); });
  };

  return (
    <div className="modal-scrim" onClick={busy ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-user-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h2 id="add-user-title">Add a user</h2>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Cancel"
            onClick={onClose}>{Ic('x', 17)}</button>
        </div>
        <form className="modal-b" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="nu-email">Email address</label>
              <input id="nu-email" value={email} autoFocus placeholder="someone@tazayud.com"
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="nu-name">Full name</label>
              <input id="nu-name" value={name} placeholder="e.g. Sara Al-Otaibi"
                onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="form-field full" style={{ marginBottom: 14 }}>
            <label htmlFor="nu-role">Role</label>
            <select id="nu-role" value={role}
              onChange={(e) => setRole(e.target.value)}>
              {seats.map((r) => <option key={r.role} value={r.role}>{r.title}</option>)}
            </select>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.6 }}>
              {seats.find((r) => r.role === role)?.describes}
            </div>
          </div>
          <div className="form-field full">
            <label htmlFor="nu-password">Initial password</label>
            <div className="row" style={{ gap: 8 }}>
              <input id="nu-password" value={password} style={{ flex: 1, fontFamily: 'ui-monospace, monospace' }}
                onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn btn-ghost"
                onClick={() => setPassword(suggestPassword())}>New one</button>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.6 }}>
              Shown once after you create the account. Ask them to change it under their profile.
            </div>
          </div>
          {tried && problem && (
            <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 10 }}>{problem}</div>
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-gold" onClick={submit} disabled={busy}>
            {Ic('plus', 15)}{busy ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Change one account: its role, its developments, its password, its status. */
function ManageAccount({ user, seats, isMe, projects, busy, onClose, onRun, onPasswordSet }: {
  user: AccountSummary;
  seats: Seat[];
  isMe: boolean;
  projects: string[];
  busy: boolean;
  onClose: () => void;
  onRun: (work: Promise<unknown>, done: string, sub?: string) => void;
  onPasswordSet: (email: string, password: string) => void;
}) {
  const accounts = useAccounts();
  const [role, setRole] = useState(user.role);
  const [assigned, setAssigned] = useState<string[]>(user.projects);

  const toggle = (id: string) => {
    setAssigned((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id].sort()));
  };

  const resetPassword = () => {
    const password = suggestPassword();
    accounts.setPassword(user.id, password)
      .then(() => { onPasswordSet(user.email, password); })
      .catch((err: unknown) => { toastError(err, 'The password was not reset'); });
  };

  return (
    <div className="modal-scrim" onClick={busy ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="manage-user-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h2 id="manage-user-title">{user.name}</h2>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Close"
            onClick={onClose}>{Ic('x', 17)}</button>
        </div>

        <div className="modal-b">
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
            {`${user.email} · account created ${day(user.createdAt)}`}
          </div>

          <div className="form-field full" style={{ marginBottom: 6 }}>
            <label htmlFor="mu-role">Role</label>
            <select id="mu-role" value={role} disabled={isMe}
              onChange={(e) => setRole(e.target.value)}>
              {seats.map((r) => <option key={r.role} value={r.role}>{r.title}</option>)}
            </select>
          </div>
          {isMe ? (
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 14, lineHeight: 1.6 }}>
              You cannot change your own role. Ask another administrator, so that nobody can
              quietly grant themselves what they were not issued.
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" style={{ marginBottom: 16 }}
              disabled={role === user.role}
              onClick={() => onRun(accounts.setRole(user.id, role), 'Role changed', `${user.name} is now ${titleOf(seats, role)}`)}>
              Save role
            </button>
          )}

          {filesFigures(seats, role) && (
            <div style={{ marginBottom: 16 }}>
              <div className="kv-l" style={{ marginBottom: 8 }}>Developments they may file for</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {projects.map((id) => (
                  <button key={id} type="button"
                    className={`chip${assigned.includes(id) ? ' on' : ''}`}
                    aria-pressed={assigned.includes(id)}
                    onClick={() => toggle(id)}>{id}</button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
                They see only these. No assignment means no access and nothing to file.
              </div>
              <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }}
                disabled={assigned.join() === user.projects.join()}
                onClick={() => onRun(
                  accounts.setAssignments(user.id, assigned),
                  'Assignments saved',
                  assigned.length ? assigned.join(' ') : 'No developments assigned',
                )}>
                Save developments
              </button>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div className="kv-l" style={{ marginBottom: 8 }}>Password</div>
            <button type="button" className="btn btn-ghost" disabled={isMe} onClick={resetPassword}>
              {Ic('settings', 15)}Reset to a new password
            </button>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.6 }}>
              {isMe
                ? 'Change your own password under your profile, where the current one is required.'
                : 'The new password is shown once. Their old one stops working immediately.'}
            </div>
          </div>
        </div>

        <div className="modal-f" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 8 }}>
            {!isMe && user.active && (
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--red)' }}
                onClick={() => onRun(
                  accounts.setActive(user.id, false),
                  'Account withdrawn',
                  `${user.name} can no longer sign in`,
                )}>Withdraw access</button>
            )}
            {!isMe && !user.active && (
              <button type="button" className="btn btn-ghost"
                onClick={() => onRun(
                  accounts.setActive(user.id, true),
                  'Account restored',
                  `${user.name} can sign in again`,
                )}>Restore access</button>
            )}
            {!isMe && !user.hasActed && (
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--red)' }}
                onClick={() => onRun(
                  accounts.remove(user.id),
                  'Account removed',
                  `${user.name} never filed anything and has been erased`,
                )}>Remove permanently</button>
            )}
          </div>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
