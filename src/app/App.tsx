import { useCallback, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Role, Scope, ScopeLevel } from '@/domain/types';
import type { PageId } from './types';
import { useScope } from '@/state/ScopeProvider';
import { integrityReport } from '@/domain/integrity';
import { useCorporate, useProjects, useRegistersFor } from '@/state/DataProvider';
import { useMessages } from '@/state/MessagesProvider';
import { useAuth } from '@/state/AuthProvider';
import { Ic, ToastHost } from '@/components';
import { NAV, TITLES } from './nav';
import { tazayudBlocks, bmiMark } from '@/assets/brand';
import { Dashboard } from '@/screens/Dashboard';
import { Projects } from '@/screens/Projects';
import { Overview } from '@/screens/Overview';
import { PeriodEntry } from '@/screens/PeriodEntry';
import { Workspace } from '@/screens/workspace/Workspace';
import { Submissions } from '@/screens/Submissions';
import { Wbs } from '@/screens/Wbs';
import { Cost } from '@/screens/cost/Cost';
import { Variations } from '@/screens/Variations';
import { ChangeLog } from '@/screens/ChangeLog';
import { Procurement } from '@/screens/Procurement';
import { Manpower } from '@/screens/Manpower';
import { Equipment } from '@/screens/Equipment';
import { Quality } from '@/screens/Quality';
import { Hse } from '@/screens/Hse';
import { Risk } from '@/screens/Risk';
import { Issues } from '@/screens/Issues';
import { Reports } from '@/screens/Reports';
import { Analytics } from '@/screens/Analytics';
import { Documents } from '@/screens/Documents';
import { Claims } from '@/screens/Claims';
import { Evaluation } from '@/screens/Evaluation';
import { Glossary } from '@/screens/Glossary';
import { Messages } from '@/screens/Messages';
import { Administration } from '@/screens/Administration';
import { Profile } from '@/screens/Profile';
import { AIExtract } from '@/features/ai-extract/AIExtract';
import { Integrity } from '@/features/integrity/Integrity';
import { AIAssistant } from '@/features/assistant/AIAssistant';
import { Notifications } from '@/features/notifications/Notifications';
import { AddProject } from '@/features/add-project/AddProject';
import { Authorisations } from '@/screens/Authorisations';

/**
 * What the six seats the product defines are called on screen.
 *
 * A LABEL, not a rule. Seats are rows an administrator adds and edits, so a
 * seat this table does not know is shown by its own name rather than as
 * `undefined` — which is exactly what a new seat is: named by whoever
 * defined it.
 */
const SEAT_TITLE: Record<string, string> = {
  admin: 'Owner Admin',
  director: 'PMO Director',
  approver: 'PMO Controls Manager',
  reviewer: 'PMO Team Leader',
  contributor: 'Project Manager',
  reader: 'Executive Viewer',
};

/**
 * Application shell: sidebar, topbar, scope selector and the routed module.
 *
 * Scope lives in the URL (see ScopeProvider), so navigation must carry the
 * query string with it — otherwise clicking a module would silently reset the
 * scope the user selected.
 */
export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const projects = useProjects();
  const { scope, updateScope, list } = useScope();
  const { months, scurve } = useCorporate();
  const registersFor = useRegistersFor();

  // The portfolios that actually hold a development this person can see, not
  // the reference list of all four. A project manager sees only their own
  // developments, so offering them the three portfolios they have nothing in
  // would be three selections that empty the screen.
  const portfolios = useMemo(
    () => [...new Set(projects.map((p) => p.portfolio))],
    [projects],
  );

  const [collapsed, setCollapsed] = useState(false);
  const [demoRole, setRole] = useState<Role>('Owner Admin');
  const [modal, setModal] = useState<'ai' | 'integrity' | 'add' | null>(null);
  const [drawer, setDrawer] = useState<'assistant' | 'notif' | null>(null);
  const [read, setRead] = useState<ReadonlySet<number>>(() => new Set());
  // WHAT THIS PERSON MAY DO, read from their seat's flags rather than from
  // its name. Seats are rows an administrator edits, so a shell that compared
  // `role === 'approver'` would offer a seat defined this morning nothing at
  // all, and would go on offering an old one buttons its flags no longer
  // carry. Offline every flag is true: there is no account there to refuse.
  const { authRequired, account, signOut, can } = useAuth();
  const { notifications } = useCorporate();

  /**
   * Who the shell believes is signed in.
   *
   * On the platform that is the account behind the token, always: the role
   * switcher in Administration is a demo affordance and must not override
   * it. On the self-contained build there is no account, so the demo role
   * stands in — which is what lets a presenter show the reader's view.
   */
  const role: string = authRequired && account
    ? (SEAT_TITLE[account.role] ?? account.role)
    : demoRole;
  const displayName = authRequired ? (account?.name ?? '') : 'Ahmed Al-Rashid';
  const unread = useMemo(() => notifications.filter((_, i) => !read.has(i)).length, [notifications, read]);
  // Unread MESSAGES, which is a different thing from unread notifications.
  const { unread: messagesUnread } = useMessages();

  /**
   * Navigate to a module, keeping the selected scope.
   *
   * The query is read from the live URL rather than a captured `location`, so
   * a handler that changes scope and then navigates cannot travel with a stale
   * search string.
   */
  const nav = useCallback((page: PageId) => {
    // Only the scope travels. A module's own parameters — the Cost screen's
    // `tab` — used to leak into every other module's URL.
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const scoped = new URLSearchParams();
    for (const k of ['level', 'portfolio', 'project']) {
      const v = params.get(k);
      if (v) scoped.set(k, v);
    }
    const search = scoped.toString();
    void navigate({ pathname: `/${page}`, search: search ? `?${search}` : '' });
  }, [navigate]);

  /**
   * Change scope and move to a module in a single navigation.
   *
   * Doing it as two steps races: both derive their target from the URL as it
   * was before the handler ran, so the second overwrites the first. That is how
   * drilling from Projects into a development silently reset scope to
   * Corporate — the header showed the right project only because it happens to
   * be the default one.
   */
  const openScoped = useCallback((page: PageId, next: Scope) => {
    const params = new URLSearchParams({
      level: next.level, portfolio: next.portfolio, project: next.project,
    });
    void navigate({ pathname: `/${page}`, search: `?${params.toString()}` });
  }, [navigate]);

  /**
   * Jump to a development named in a message.
   *
   * A message carries the development id it is about as a REFERENCE, not a
   * link into the data — so this looks the development up to find the
   * portfolio the scope needs, and does nothing if it is no longer in the
   * portfolio. Landing on a scope that names a development somebody cannot
   * see would show them an empty screen and no reason for it.
   */
  const openProject = useCallback((projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    openScoped('workspace', {
      level: 'Project', portfolio: target.portfolio, project: target.id,
    });
  }, [projects, openScoped]);

  const page = (location.pathname.replace(/^\//, '') || 'dashboard') as PageId;
  const title = TITLES[page] ?? TITLES.dashboard;
  // What the shell offers. On the platform, adding a development is an
  // administrator's act and the server refuses anyone else, so the button
  // is only shown to one; entering figures is a contributor's. The demo
  // role stands in offline, as before.
  const canEdit = authRequired ? can.input || can.administer : role !== 'Executive Viewer';
  // Registering and retiring a development are portfolio acts: the PMO
  // manager, who approves, and the administrator. A project manager never has
  // them however many developments they are assigned.
  // A module a seat may not open does not appear in its sidebar. In the
  // self-contained build there are no accounts, so nothing is hidden — there
  // is nobody to hide it from, and the pixel gates see every module.
  const navItems = NAV.filter((n) => !n.needs || !authRequired || n.needs(can));

  // Registering, amending, deleting and closing out a development. On the
  // platform that is the seat that approves, the seat that authorises and the
  // administrator — a seat that may only authorise still needs the buttons,
  // because authorising a proposal it can never see the shape of is not a
  // decision. Offline the demo role stands in, as before.
  const canAddProject = authRequired
    ? can.approve || can.authorise || can.administer
    : role === 'Owner Admin' || role === 'PMO Director';

  // The badge reports the live reconciliation state, not a fixed "10/10".
  // Memoised: eight developments times twenty controls re-ran on every
  // keystroke, drawer and toast, for a figure that only moves with the data.
  const integrity = useMemo(
    () => integrityReport(list, registersFor, months, scurve),
    [list, registersFor, months, scurve],
  );

  return (
    <div className="app">
      <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="side-logo">
          {/* The blocks alone. The official lockup carries the wordmarks in
              #0E223A, which on this navy rail is very nearly invisible — and
              the collapsed rail has no room for them — so the mark is shown
              here and the wordmark stays HTML text, which the theme can
              colour. Both come from the same supplied file. */}
          <img className="logo-mark" src={tazayudBlocks} alt="" width={34} height={30} />
          <div className="logo-text">
            <div className="lt1">TAZAYUD</div>
            <div className="lt2">REAL ESTATE DEVELOPER</div>
          </div>
        </div>
        <div className="side-sub">Owner PMO Controls</div>
        <div className="nav">
          {navItems.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`nav-item${page === n.id || (page === 'overview' && n.id === 'projects') ? ' active' : ''}`}
              aria-current={page === n.id ? 'page' : undefined}
              onClick={() => nav(n.id)}
            >
              <span className="ic">{Ic(n.icon, 18)}</span>
              <span className="lbl">{n.label}</span>
            </button>
          ))}
        </div>
        {/* Who built it, at the size that is appropriate: a credit, not a
            co-brand. It sits below the navigation and above the signed-in
            account, so it appears once on every screen and never competes
            with the owner's own mark. */}
        <div className="built-by">
          {/* On a white plate: the supplied mark is blue and orange on white,
              and blue on navy is a mark nobody can read. A plate keeps the
              artwork exactly as supplied. */}
          <img className="bmi-mark" src={bmiMark} alt="" />
          <span>Developed by BMI+ Advisory</span>
        </div>

        <div className="side-user">
          {account?.avatar
            ? <img className="avatar" src={account.avatar} alt="" width={34} height={34}
              style={{ objectFit: 'cover' }} />
            : <div className="avatar" aria-hidden="true">{(displayName || role)[0]}</div>}
          {/* Your own account, not the administration screen. Everyone has a
              profile; only one role has Administration, and sending a reader
              there was an invitation to a screen that mostly refused them. */}
          <button type="button" className="user-meta" onClick={() => nav('profile')}
            title="Your profile" aria-label={`Your profile, ${displayName}`}>
            <div className="um1">{displayName}</div>
            <div className="um2">{role}</div>
          </button>
          {authRequired && (
            <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out"
              style={{ width: 30, height: 30 }} onClick={signOut}>
              {Ic('x', 15)}
            </button>
          )}
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
              {Ic('collapse', 18)}
            </button>
            <div className="page-title"><h1>{title[0]}</h1><p>{title[1]}</p></div>
          </div>
          <div className="topbar-right">
            <div className="scope">
              <div className="scope-field">
                <label>Scope Level</label>
                <select value={scope.level} onChange={(e) => updateScope({ level: e.target.value as ScopeLevel })}>
                  {(['Corporate', 'Portfolio', 'Project'] as const).map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
              {scope.level !== 'Corporate' && (
                <div className="scope-field">
                  <label>Portfolio</label>
                  <select value={scope.portfolio} onChange={(e) => updateScope({ portfolio: e.target.value })}>
                    {portfolios.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
              )}
              {scope.level === 'Project' && (
                <div className="scope-field">
                  <label>Project</label>
                  <select value={scope.project} onChange={(e) => updateScope({ project: e.target.value })}>
                    {/* Closed developments stay in this list, marked. They
                        are out of the roll-ups, not out of the system — being
                        able to open a finished job and read its registers is
                        the whole reason closing is not archiving. */}
                    {projects.filter((p) => p.portfolio === scope.portfolio)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.closedAt ? `${p.id} — closed` : p.id}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
            {canEdit && <button className="btn btn-ai" onClick={() => setModal('ai')}>{Ic('ai', 15)}AI Extract</button>}
            <button className="btn btn-ghost" onClick={() => setModal('integrity')}>
              {Ic('shield2', 15)}{`${integrity.passed}/${integrity.total}`}
            </button>
            {canAddProject && <button className="btn btn-gold" onClick={() => setModal('add')}>{Ic('plus', 15)}Add Project</button>}
            {/* Messages sit beside notifications and not inside them: a
                notification is the system telling you something happened, a
                message is a person asking you a question. Conflating the two
                buries the one that needs an answer. */}
            <button className="icon-btn" onClick={() => nav('messages')}
              aria-label={`Messages, ${messagesUnread} unread`} title="Messages">
              {Ic('message', 18)}
              {messagesUnread > 0 && <span className="badge-dot">{messagesUnread}</span>}
            </button>
            <button className="icon-btn" onClick={() => setDrawer('notif')}
              aria-label={`Notifications, ${unread} unread`}>
              {Ic('bell', 18)}{unread > 0 && <span className="badge-dot">{unread}</span>}
            </button>
            <button className="icon-btn" onClick={() => setDrawer('assistant')} aria-label="PMO assistant">
              {Ic('ai', 18)}
            </button>
            {/* Sign out, where a person looks for it: the top right, beside
                everything else about them rather than only at the bottom of
                the sidebar behind their own name. It replaced the user manual
                link, which now lives on the Glossary screen — a manual is
                something you go and read, not something you need one click
                from every screen. */}
            {authRequired && (
              <button className="icon-btn" aria-label="Sign out" title="Sign out"
                onClick={signOut}>
                {Ic('signout', 18)}
              </button>
            )}
          </div>
        </div>
        <div className="content">
          <Routes>
            <Route path="/" element={<Navigate to={{ pathname: '/dashboard', search: location.search }} replace />} />
            <Route path="/dashboard" element={<Dashboard nav={nav} openAI={() => setDrawer('assistant')} />} />
            <Route path="/projects" element={<Projects openScoped={openScoped} canRetire={canAddProject} />} />
            <Route path="/overview" element={<Overview nav={nav} />} />
            <Route path="/workspace"
              element={(
                <Workspace nav={nav} canEdit={canEdit} canAmend={canAddProject}
                  openAI={() => { setModal('ai'); }} />
              )} />
            <Route path="/period" element={<PeriodEntry />} />
            <Route path="/submissions" element={<Submissions />} />
            <Route path="/authorisations" element={<Authorisations />} />
            <Route path="/wbs" element={<Wbs />} />
            <Route path="/cost" element={<Cost canEdit={canEdit} />} />
            <Route path="/variations" element={<Variations />} />
            <Route path="/change" element={<ChangeLog />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/manpower" element={<Manpower />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/quality" element={<Quality />} />
            <Route path="/hse" element={<Hse />} />
            <Route path="/risk" element={<Risk />} />
            <Route path="/issues" element={<Issues />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/documents" element={<Documents openAI={() => setModal('ai')} canEdit={canEdit} />} />
            <Route path="/claims" element={<Claims />} />
            <Route path="/evaluation" element={<Evaluation />} />
            <Route path="/glossary" element={<Glossary />} />
            <Route path="/messages" element={<Messages nav={nav} openProject={openProject} />} />
            <Route path="/admin" element={<Administration role={role} setRole={authRequired ? undefined : setRole} />} />
            <Route path="/profile" element={<Profile role={role} />} />
            <Route path="*" element={<Navigate to={{ pathname: '/dashboard', search: location.search }} replace />} />
          </Routes>
        </div>
      </div>

      {modal === 'ai' && <AIExtract onClose={() => setModal(null)} />}
      {modal === 'integrity' && <Integrity onClose={() => setModal(null)} />}
      {modal === 'add' && <AddProject onClose={() => setModal(null)} />}
      {drawer === 'assistant' && <AIAssistant onClose={() => setDrawer(null)} />}
      {drawer === 'notif' && (
        <Notifications onClose={() => setDrawer(null)} read={read}
          onRead={(ix) => setRead((r) => new Set([...r, ...ix]))} />
      )}
      <ToastHost />
    </div>
  );
}
