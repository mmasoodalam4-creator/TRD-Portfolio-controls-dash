import { useState } from 'react';
import type { Role } from '@/domain/types';
import {
  useAuditFor, useCorporate, useMutations, useReference, useSeats,
  type PortfolioTone, type Seat, type SeatCapabilities,
} from '@/state/DataProvider';
import { PORTFOLIO_TONES, TONE_HEX } from '@/domain/portfolios';
import { useAuth } from '@/state/AuthProvider';
import { Badge, Ic, AuditTimeline, toast, toastError } from '@/components';
import { Accounts } from './admin/Accounts';

const TABS = ['Users', 'Roles & Permissions', 'Portfolios & Routes', 'Audit Log', 'System Settings'];

/** The demo's presentation roles, previewed with the switcher. */
const DEMO_PERMS: [string, string, string][] = [
  ['Owner Admin', 'Full access to all modules and settings', 'All'],
  ['PMO Director', 'Approve variations, view all, manage reports', 'Approve · View · Report'],
  ['Portfolio Manager', 'Manage portfolio projects and reviews', 'Edit · Review'],
  ['Project Manager', 'Manage own project data and submissions', 'Edit own project'],
  ['PMC User', 'Submit updates, IPCs and reports', 'Submit · Upload'],
  ['Executive Viewer', 'Read-only dashboards and reports', 'View only'],
];

/** Users, roles and system settings. */
export function Administration({ role, setRole }: { role: string; setRole?: (r: Role) => void }) {
  const [tab, setTab] = useState('Users');
  const audit = useAuditFor();
  const { authRequired, account } = useAuth();

  return (
    <div className="fade-up">
      <div className="card">
        <div className="card-b">
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} type="button" className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {tab === 'Users' ? (
            !authRequired ? (
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                The self-contained demonstration has no accounts and no sign-in. Use the role
                switcher under <strong>Roles &amp; Permissions</strong> to preview what each role sees.
                Accounts exist only in the platform deployment, where an administrator issues them.
              </p>
            ) : account?.can.administer ? (
              <Accounts />
            ) : (
              <div>
                <div className="between" style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14 }}>Signed-in account</h3>
                </div>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>{['Name', 'Role', 'Email', 'Status'].map((x) => <th key={x}>{x}</th>)}</tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <div className="row" style={{ gap: 9 }}>
                            {account?.avatar
                              ? <img className="avatar" src={account.avatar} alt="" width={30} height={30}
                                style={{ width: 30, height: 30 }} />
                              : <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                                {account?.name[0]?.toUpperCase() ?? '?'}
                              </div>}
                            <b>{account?.name}</b>
                          </div>
                        </td>
                        <td><span className="pill b-blue">{account?.role}</span></td>
                        <td>{account?.email}</td>
                        <td><Badge status="Active" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 14 }}>
                  Accounts are issued by the administrator, with a role and, for a project manager,
                  the developments they may file for. Your own name, picture and password are yours
                  to change under <strong>My Profile</strong>.
                </p>
              </div>
            )
          ) : tab === 'Roles & Permissions' ? (
            <RolesPanel role={role} setRole={setRole} platform={authRequired} />
          ) : tab === 'Portfolios & Routes' ? (
            <Vocabulary platform={authRequired} />
          ) : tab === 'Audit Log' ? (
            audit.length
              ? <AuditTimeline events={audit} />
              : <p className="muted" style={{ fontSize: 12.5 }}>No changes have been recorded yet.</p>
          ) : (
            <DataPanel platform={authRequired} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Recorded changes, and how to drop them.
 *
 * The demo persists what is done to it, which is what makes the actions
 * real — and means a presenter needs a way back to a clean slate before the
 * next meeting. On the platform the same log lives in the database, and the
 * reset is available only where the deployment allows it.
 */
function DataPanel({ platform }: { platform: boolean }) {
  const { reset, changeCount } = useMutations();
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <div className="card" style={{ background: 'var(--bg)' }}>
        <div className="card-b">
          <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Recorded changes</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.6 }}>
                {changeCount === 0
                  ? 'No changes recorded. The system is showing the data it was loaded with.'
                  : `${changeCount} change${changeCount === 1 ? '' : 's'} recorded — certificates, `
                    + `approvals, periods and new developments${platform ? '.' : '. These persist in this browser across reloads.'}`}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={changeCount === 0 || busy}
              onClick={() => {
                setBusy(true);
                reset()
                  .then(() => { toast('Reset complete', 'Returned to the shipped data set'); })
                  .catch((err: unknown) => { toastError(err, 'Reset refused'); })
                  .finally(() => { setBusy(false); });
              }}
            >
              {Ic('change', 15)}{busy ? 'Resetting…' : 'Reset to shipped data'}
            </button>
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 14 }}>
        {platform
          ? 'Changes are recorded in the database as an audit log shared by every user. The reset '
            + 'is an administrator action, available only while the deployment holds dummy data and '
            + 'permits it; it is disabled for the live data set.'
          : 'Changes are held in this browser only. They never leave the machine, and clearing site '
            + 'data removes them. In the platform deployment the same actions post to the server and '
            + 'this panel reads the shared audit log.'}
      </p>
    </div>
  );
}

/**
 * SEATS — what each may do, and (for an administrator) editing it.
 *
 * This panel used to carry its own table of five roles with its own
 * descriptions. `db/migrations/015` made seats rows in a table an
 * administrator edits and added a sixth — the Director, who authorises
 * changes to a development — so a hardcoded list here would be a restatement
 * of the enforcement that could disagree with it, which is the defect this
 * codebase exists to catch.
 *
 * The self-contained build keeps the demo's presentation roles: there are no
 * accounts there, so there are no seats to read and the switcher is a
 * presenter's affordance rather than an access model.
 */
function RolesPanel({ role, setRole, platform }: { role: string; setRole?: (r: Role) => void; platform: boolean }) {
  const { roles } = useCorporate();
  if (platform) return <Seats role={role} />;
  return (
    <div>
      {setRole && <div className="card" style={{ marginBottom: 16, background: 'var(--blue-bg)', borderColor: '#cfe0f6' }}>
        <div className="card-b">
          <div className="between">
            <div>
              <div style={{ fontWeight: 700 }}>Current Session Role</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Switch role to preview permissions across the system
              </div>
            </div>
            <select
              aria-label="Session role"
              value={role}
              onChange={(e) => { setRole(e.target.value as Role); toast('Role switched', e.target.value, 'info'); }}
              style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--line)', fontWeight: 600 }}
            >
              {roles.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>}
      {!setRole && (
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.7 }}>
          {`Your role is ${role}. Roles are assigned by the administrator when an account is issued; they cannot be switched from here. `}
          The submitter of a period can never be its reviewer or approver, and the reviewer can never be
          the approver — the database enforces this for every role, including admin.
        </p>
      )}

      <div className="tbl-wrap">
        <table>
          <thead><tr>{['Role', 'Description', 'Permissions'].map((x) => <th key={x}>{x}</th>)}</tr></thead>
          <tbody>
            {DEMO_PERMS.map((p, i) => (
              <tr key={i} className={p[0].startsWith(role) ? 'sel' : ''}>
                <td><b>{p[0]}</b></td>
                <td>{p[1]}</td>
                <td><span className="pill b-blue">{p[2]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * THE FIVE CAPABILITIES, and what each actually means.
 *
 * Deliberately five flags rather than one "may write": a reviewer writes (a
 * review) and must never input, and an approver writes (an approval) and must
 * never input either. A single flag would lose the distinction this system
 * exists to enforce.
 */
const CAPABILITIES: { key: keyof SeatCapabilities; label: string; does: string }[] = [
  { key: 'input', label: 'Input', does: 'Files reporting periods and records certificates, for assigned developments only' },
  { key: 'review', label: 'Validate', does: 'Validates a filed period, or returns it. Never its own input' },
  { key: 'approve', label: 'Approve', does: 'Approves a validated period and a payment claim, and PROPOSES changes to a development' },
  { key: 'authorise', label: 'Authorise', does: 'Authorises a proposed change to a development before it takes effect' },
  { key: 'administer', label: 'Administer', does: 'Issues accounts, defines seats, and acts without a second person' },
];

/** A name a URL, a token and an exception message all read the same way. */
const NAME_SHAPE = /^[a-z][a-z0-9_-]{2,31}$/;

/**
 * The seats, live from the database an administrator edits.
 *
 * Everyone reads this — a person who cannot press a button is owed an
 * explanation of who can — and only an administrator writes it, which the
 * server enforces and this screen only reflects.
 *
 * `sodExempt` is shown and NEVER editable. The exemption is the owner's
 * standing instruction for the administrator and nobody else; a screen that
 * could hand it to a new seat would be a screen that dissolves separation of
 * duties in two clicks, and `updateSeat` in server/db.ts refuses to set it at
 * all. Changing it is a migration, which is the friction it should have.
 */
function Seats({ role }: { role: string }) {
  const { seats, loading, error, create, update, remove } = useSeats();
  const { account } = useAuth();
  const mayEdit = Boolean(account?.can.administer);
  // The SEAT NAME, for the row highlight; `role` is the title it is shown by,
  // which never matches a seat name and so never highlighted anything.
  const mine = account?.role ?? '';
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run = (key: string, work: Promise<unknown>, done: string, sub?: string) => {
    setBusy(key);
    work
      .then(() => { toast(done, sub); })
      .catch((err: unknown) => { toastError(err, 'The change was refused'); })
      .finally(() => { setBusy(null); });
  };

  const toggle = (seat: Seat, key: keyof SeatCapabilities) => {
    run(
      seat.role,
      update(seat.role, { can: { ...seat.can, [key]: !seat.can[key] } }),
      'Seat updated',
      `${seat.title} ${seat.can[key] ? 'no longer' : 'now'} carries ${key}`,
    );
  };

  if (loading && seats.length === 0) {
    return <p className="muted" style={{ fontSize: 12.5 }}>Reading the seats…</p>;
  }
  if (error) {
    return <p className="muted" style={{ fontSize: 12.5 }}>{`The seats could not be read: ${error}`}</p>;
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.7 }}>
        {`Your seat is ${role}. `}
        {mayEdit
          ? 'A seat is a row in this table, so adding one or changing what it may do needs no '
            + 'deploy. What it may do is read on every request, so a change takes effect on the '
            + 'next click rather than when a token expires.'
          : 'Seats are defined by the administrator. What each may do is enforced by the server '
            + 'and, for separation of duties, by the database itself.'}
        {' The submitter of a period can never be its reviewer or approver, and the reviewer can '}
        never be the approver — that is a database rule, not a setting, and it binds every seat
        that is not marked exempt.
      </p>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              {['Seat', 'What it is for', ...CAPABILITIES.map((c) => c.label), 'Accounts', ''].map(
                (x, i) => <th key={`${x}-${i}`}>{x}</th>,
              )}
            </tr>
          </thead>
          <tbody>
            {seats.map((seat) => (
              <tr key={seat.role} className={seat.role === mine ? 'sel' : ''}>
                <td>
                  <b>{seat.title}</b>
                  <div className="muted" style={{ fontSize: 11 }}>{seat.role}</div>
                  {seat.sodExempt && (
                    <span className="pill b-amber" title="May occupy two stages of one approval trail">
                      Exempt from separation of duties
                    </span>
                  )}
                </td>
                {/* A DIV, not `max-width` on the cell. A table in `auto`
                    layout ignores a max-width on a `<td>` — the content's own
                    minimum decides — so the sentence was painted straight
                    across the capability chips beside it. A block inside the
                    cell honours it. `check:layout` could not see this: it
                    drives the offline build, where this panel does not exist
                    because there are no seats to read. */}
                <td>
                  <div style={{ maxWidth: 340, whiteSpace: 'normal' }}>{seat.describes}</div>
                </td>
                {CAPABILITIES.map((c) => (
                  <td key={c.key}>
                    {/* The administrator's own seat is FIXED. Taking
                        `administer` off it is the one click that could lock
                        every administrator out of the system, and it would do
                        so silently — so the server refuses it and this does
                        not offer it. */}
                    {mayEdit && seat.role !== 'admin' ? (
                      <button
                        type="button"
                        className={`chip${seat.can[c.key] ? ' on' : ''}`}
                        aria-pressed={seat.can[c.key]}
                        aria-label={`${c.label} for ${seat.title}`}
                        title={c.does}
                        disabled={busy === seat.role}
                        onClick={() => toggle(seat, c.key)}
                      >
                        {seat.can[c.key] ? 'Yes' : 'No'}
                      </button>
                    ) : (
                      <span className={`pill b-${seat.can[c.key] ? 'green' : 'grey'}`}>
                        {seat.can[c.key] ? 'Yes' : 'No'}
                      </span>
                    )}
                  </td>
                ))}
                <td>{seat.holders}</td>
                <td>
                  {mayEdit && !seat.builtIn && (
                    <button type="button" className="btn btn-ghost"
                      style={{ padding: '6px 11px', color: 'var(--red)' }}
                      disabled={busy === seat.role || seat.holders > 0}
                      onClick={() => run(seat.role, remove(seat.role), 'Seat removed',
                        `${seat.title} is no longer offered`)}>
                      Remove
                    </button>
                  )}
                  {/* THE DISABLED CONTROL SAYS WHY. A seat somebody holds
                      cannot go — their next request would find their role
                      missing and sign them out with no way back — and a seat
                      the product names in code cannot go either. */}
                  {mayEdit && !seat.builtIn && seat.holders > 0 && (
                    <div className="form-hint">
                      {`${seat.holders} account${seat.holders === 1 ? '' : 's'} hold this seat. `}
                      Move them to another seat first.
                    </div>
                  )}
                  {mayEdit && seat.builtIn && (
                    <span className="muted" style={{ fontSize: 11 }}>Defined by the product</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {mayEdit && !adding && (
          <button type="button" className="btn btn-gold" onClick={() => setAdding(true)}>
            {Ic('plus', 15)}Add a seat
          </button>
        )}
        <span className="muted" style={{ fontSize: 11.5 }}>
          {`${seats.length} seat${seats.length === 1 ? '' : 's'} defined`}
        </span>
      </div>

      {adding && (
        <AddSeat
          onClose={() => setAdding(false)}
          onCreate={async (input) => {
            await create(input);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

/** Define a seat: a name, a title, a line saying what it is for, and its flags. */
function AddSeat({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (input: {
    role: string; title: string; describes: string; can: SeatCapabilities;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [describes, setDescribes] = useState('');
  const [can, setCan] = useState<SeatCapabilities>({
    input: false, review: false, approve: false, authorise: false, administer: false,
  });
  const [busy, setBusy] = useState(false);

  // Every refusal the server would make, made here first and SAID — so the
  // button that is dead explains itself rather than reading as broken.
  const problem = !NAME_SHAPE.test(name.trim().toLowerCase())
    ? 'A seat name is 3 to 32 characters, lower case, starting with a letter — it appears in URLs and in refusal messages'
    : !title.trim() ? 'Give the seat a name people will recognise'
      : !describes.trim() ? 'Say in one line what the seat is for; it is shown beside it'
        : null;

  return (
    <div className="modal-scrim" onClick={busy ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-seat-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h2 id="add-seat-title">Add a seat</h2>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }}
            aria-label="Cancel" onClick={onClose}>{Ic('x', 17)}</button>
        </div>
        <div className="modal-b">
          <div className="form-field full" style={{ marginBottom: 12 }}>
            <label htmlFor="seat-name">Seat name</label>
            <input id="seat-name" value={name} maxLength={32}
              onChange={(e) => setName(e.target.value)} placeholder="e.g. commercial_lead" />
          </div>
          <div className="form-field full" style={{ marginBottom: 12 }}>
            <label htmlFor="seat-title">What it is called on screen</label>
            <input id="seat-title" value={title} maxLength={80}
              onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Commercial Lead" />
          </div>
          <div className="form-field full" style={{ marginBottom: 12 }}>
            <label htmlFor="seat-does">What it is for</label>
            <input id="seat-does" value={describes} maxLength={200}
              onChange={(e) => setDescribes(e.target.value)}
              placeholder="One line, shown beside the seat" />
          </div>

          <div className="kv-l" style={{ marginBottom: 8 }}>What it may do</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {CAPABILITIES.map((c) => (
              <button key={c.key} type="button"
                className={`chip${can[c.key] ? ' on' : ''}`}
                aria-pressed={can[c.key]}
                title={c.does}
                onClick={() => setCan((x) => ({ ...x, [c.key]: !x[c.key] }))}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="form-hint">
            {problem
              ?? 'A new seat is never exempt from separation of duties: it can hold one stage of '
                + 'an approval trail, never two. That exemption is a migration, deliberately.'}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" disabled={busy}
            onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-gold" disabled={busy || problem !== null}
            onClick={() => {
              setBusy(true);
              onCreate({ role: name.trim().toLowerCase(), title: title.trim(), describes: describes.trim(), can })
                .then(() => { toast('Seat defined', `${title.trim()} can now be issued to an account`); })
                .catch((err: unknown) => { toastError(err, 'The seat was not created'); })
                .finally(() => { setBusy(false); });
            }}>
            {Ic('plus', 15)}{busy ? 'Adding…' : 'Add this seat'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * THE PORTFOLIOS AND THE DELIVERY ROUTES.
 *
 * The last two lists that needed a developer. A portfolio was a union type in
 * the model, a constant in the server's validator, a colour map on two screens
 * and a JSON array in the corporate table — five copies of the same four words
 * — and `db/migrations/017` made it a row instead.
 *
 * What this panel refuses is more interesting than what it offers:
 *
 *   - A portfolio a development is IN is never removed. The count beside it
 *     is read from the replayed position, not from a foreign key, because a
 *     development registered through this application lives only in the
 *     change log — so the count is the honest answer and a constraint would
 *     have been a false one.
 *   - A portfolio the product defines is never removed either. Four of them
 *     are named in the fixtures the offline build ships with.
 *   - RENAMING IS NOT OFFERED AT ALL, and that is the important one. Every
 *     development carries its portfolio's NAME as its own value, in the
 *     database and inside payloads in the change log; renaming here would
 *     orphan all of them silently, and nothing would look wrong until a
 *     roll-up came back empty. Add the right one, move the developments,
 *     remove the wrong one — three acts somebody can see.
 */
function Vocabulary({ platform }: { platform: boolean }) {
  const {
    portfolios, routes, loading, error, addPortfolio, addRoute, setTone,
    removePortfolio, removeRoute,
  } = useReference(platform);
  const { account } = useAuth();
  const mayEdit = Boolean(account?.can.administer);
  const [busy, setBusy] = useState<string | null>(null);
  const [newPortfolio, setNewPortfolio] = useState('');
  const [newTone, setNewTone] = useState<PortfolioTone>('teal');
  const [newRoute, setNewRoute] = useState('');
  const [newRouteDoes, setNewRouteDoes] = useState('');

  const run = (key: string, work: Promise<unknown>, done: string, sub?: string) => {
    setBusy(key);
    work
      .then(() => { toast(done, sub); })
      .catch((err: unknown) => { toastError(err, 'The change was refused'); })
      .finally(() => { setBusy(null); });
  };

  if (!platform) {
    return (
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        This build ships with the four portfolios and the two delivery routes it was built
        from, and there is no database behind it to hold a fifth. On the hosted platform an
        administrator adds, recolours and removes them here, and every screen — the scope
        selector, the Projects register, the Dashboard charts, the Add Project form and the
        new-development workbook — follows without a deploy.
      </p>
    );
  }
  if (loading && portfolios.length === 0) {
    return <p className="muted" style={{ fontSize: 12.5 }}>Reading the lists…</p>;
  }
  if (error) {
    return <p className="muted" style={{ fontSize: 12.5 }}>{`The lists could not be read: ${error}`}</p>;
  }

  // An UNTOUCHED field is not a complaint. The hint says what adding one
  // does until somebody starts typing; only then does it say what is wrong.
  const nameProblem = (name: string, taken: readonly { name: string }[]): string | null => {
    const v = name.trim();
    if (!v) return null;
    if (v.length < 2) return 'A name is at least two characters';
    if (v.length > 60) return 'A name is at most sixty characters';
    if (taken.some((x) => x.name.toLowerCase() === v.toLowerCase())) return `${v} already exists`;
    return null;
  };
  const portfolioProblem = nameProblem(newPortfolio, portfolios);
  const routeProblem = nameProblem(newRoute, routes);

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16, lineHeight: 1.7 }}>
        {mayEdit
          ? 'A portfolio and a delivery route are rows in this system, so adding one needs no '
            + 'deploy. Every screen follows: the scope selector, the Projects register, the '
            + 'Dashboard charts, the Add Project form and the new-development workbook.'
          : 'Portfolios and delivery routes are defined by the administrator. Every development '
            + 'belongs to one of each, and the roll-ups are built from them.'}
        {' A portfolio cannot be RENAMED — every development carries its name as its own value, '}
        so a rename would orphan them silently. Add the right one, move the developments, and
        remove the one that is empty.
      </p>

      <h3 style={{ fontSize: 14, marginBottom: 10 }}>Portfolios</h3>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>{['Portfolio', 'Drawn in', 'Developments', ''].map((x) => <th key={x}>{x}</th>)}</tr>
          </thead>
          <tbody>
            {portfolios.map((pf) => (
              <tr key={pf.name}>
                <td>
                  <span className="pill"
                    style={{ background: `${TONE_HEX[pf.tone]}1f`, color: TONE_HEX[pf.tone] }}>
                    {pf.name}
                  </span>
                </td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {PORTFOLIO_TONES.map((t) => (
                      mayEdit ? (
                        <button
                          key={t}
                          type="button"
                          className={`chip${pf.tone === t ? ' on' : ''}`}
                          aria-label={`${t} for ${pf.name}`}
                          aria-pressed={pf.tone === t}
                          title={t}
                          disabled={busy === pf.name}
                          onClick={() => run(pf.name, setTone(pf.name, t), 'Portfolio recoloured',
                            `${pf.name} is drawn in ${t}`)}
                          style={{ background: TONE_HEX[t], color: '#fff',
                            borderColor: pf.tone === t ? 'var(--navy)' : 'transparent',
                            borderWidth: pf.tone === t ? 2 : 1, minWidth: 34 }}
                        >
                          {pf.tone === t ? '●' : ' '}
                        </button>
                      ) : null
                    ))}
                    {!mayEdit && <span className="muted" style={{ fontSize: 11.5 }}>{pf.tone}</span>}
                  </div>
                </td>
                <td>{pf.developments}</td>
                <td>
                  {mayEdit && !pf.builtIn && (
                    <button type="button" className="btn btn-ghost"
                      style={{ padding: '6px 11px', color: 'var(--red)' }}
                      disabled={busy === pf.name || pf.developments > 0}
                      onClick={() => run(pf.name, removePortfolio(pf.name), 'Portfolio removed',
                        `${pf.name} is no longer offered`)}>
                      Remove
                    </button>
                  )}
                  {/* THE DISABLED CONTROL SAYS WHY, as every refusal in this
                      application does. */}
                  {mayEdit && !pf.builtIn && pf.developments > 0 && (
                    <div className="form-hint">
                      {`${pf.developments} development${pf.developments === 1 ? ' is' : 's are'} in it. `}
                      Move them to another portfolio first.
                    </div>
                  )}
                  {mayEdit && pf.builtIn && (
                    <span className="muted" style={{ fontSize: 11 }}>Defined by the product</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mayEdit && (
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="form-field" style={{ minWidth: 220 }}>
            <label htmlFor="new-portfolio">Add a portfolio</label>
            <input id="new-portfolio" value={newPortfolio} maxLength={60}
              aria-describedby="new-portfolio-hint"
              onChange={(e) => setNewPortfolio(e.target.value)}
              placeholder="e.g. Hospitality" />
          </div>
          <div className="form-field">
            <label htmlFor="new-tone">Drawn in</label>
            <select id="new-tone" value={newTone}
              onChange={(e) => setNewTone(e.target.value as PortfolioTone)}>
              {PORTFOLIO_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-gold" style={{ marginTop: 20 }}
            disabled={busy !== null || !newPortfolio.trim() || portfolioProblem !== null}
            onClick={() => {
              run('new', addPortfolio(newPortfolio.trim(), newTone), 'Portfolio added',
                `${newPortfolio.trim()} is now offered wherever a portfolio is chosen`);
              setNewPortfolio('');
            }}>
            {Ic('plus', 15)}Add portfolio
          </button>
          <div id="new-portfolio-hint" className="form-hint" style={{ flexBasis: '100%' }}>
            {portfolioProblem ?? 'It appears in the scope selector, the Projects tabs, the '
              + 'Dashboard charts and the Add Project form as soon as it is added.'}
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 14, margin: '22px 0 10px' }}>Delivery routes</h3>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>{['Route', 'What it means', 'Developments', ''].map((x) => <th key={x}>{x}</th>)}</tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.name}>
                <td><b>{r.name}</b></td>
                <td>
                  <div style={{ maxWidth: 420, whiteSpace: 'normal' }}>
                    {r.describes || <span className="muted">not described</span>}
                  </div>
                </td>
                <td>{r.developments}</td>
                <td>
                  {mayEdit && !r.builtIn && (
                    <button type="button" className="btn btn-ghost"
                      style={{ padding: '6px 11px', color: 'var(--red)' }}
                      disabled={busy === r.name || r.developments > 0}
                      onClick={() => run(r.name, removeRoute(r.name), 'Delivery route removed',
                        `${r.name} is no longer offered`)}>
                      Remove
                    </button>
                  )}
                  {mayEdit && !r.builtIn && r.developments > 0 && (
                    <div className="form-hint">
                      {`${r.developments} development${r.developments === 1 ? ' is' : 's are'} on it. `}
                      Move them first.
                    </div>
                  )}
                  {mayEdit && r.builtIn && (
                    <span className="muted" style={{ fontSize: 11 }}>Defined by the product</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mayEdit && (
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="form-field" style={{ minWidth: 200 }}>
            <label htmlFor="new-route">Add a delivery route</label>
            <input id="new-route" value={newRoute} maxLength={60}
              aria-describedby="new-route-hint"
              onChange={(e) => setNewRoute(e.target.value)} placeholder="e.g. Design-Build" />
          </div>
          <div className="form-field" style={{ minWidth: 300 }}>
            <label htmlFor="new-route-does">What it means</label>
            <input id="new-route-does" value={newRouteDoes} maxLength={200}
              onChange={(e) => setNewRouteDoes(e.target.value)}
              placeholder="One line, shown beside it" />
          </div>
          <button type="button" className="btn btn-gold" style={{ marginTop: 20 }}
            disabled={busy !== null || !newRoute.trim() || routeProblem !== null}
            onClick={() => {
              run('new-route', addRoute(newRoute.trim(), newRouteDoes.trim()),
                'Delivery route added', `${newRoute.trim()} is now offered`);
              setNewRoute('');
              setNewRouteDoes('');
            }}>
            {Ic('plus', 15)}Add route
          </button>
          <div id="new-route-hint" className="form-hint" style={{ flexBasis: '100%' }}>
            {routeProblem ?? 'A development on a route this system does not hold is refused by '
              + 'the server, so this list is what the Add Project form and the workbook accept.'}
          </div>
        </div>
      )}
    </div>
  );
}
