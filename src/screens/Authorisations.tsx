// ==========================================================================
// AUTHORISATIONS — changes to a development, proposed and waiting
//
// The second two-person control in this system, and it is deliberately the
// same shape as the first. A reporting period is entered by one person,
// validated by a second and approved by a third; the acts that decide what a
// development IS — registering it, amending it, deleting it, restoring it,
// closing it out, reopening it, awarding a package against it — used to take
// effect the moment the PMO Controls Manager pressed the button.
//
// On the owner's instruction they now take two: the manager PROPOSES and the
// Director AUTHORISES, and nothing moves in between.
//
// THE QUEUE IS NOT THE RECORD. A row here has moved no figure, appears in no
// roll-up and is not in the change log. The mutation is appended at the moment
// of authorisation, through the same write lock and the same twenty
// reconciliation controls as a direct act — which is why a proposal that was
// sound on Monday can still be refused on Thursday, and says so.
//
// What is NOT here is monthly data entry. It has its own three-stage workflow
// already, and a second queue in front of it would mean a period waiting on
// four people.
// ==========================================================================
import { useState } from 'react';
import { useAuth } from '@/state/AuthProvider';
import { useChanges, type ProposedChange } from '@/state/DataProvider';
import { Badge, Ic, toast, toastError } from '@/components';
import { NotYourSeat } from './NotYourSeat';

/** How each state reads, and the badge tone that carries it. */
const STATE: Record<ProposedChange['state'], { label: string; tone: string }> = {
  pending: { label: 'Waiting for authorisation', tone: 'Awaiting review' },
  approved: { label: 'Authorised and applied', tone: 'Approved' },
  rejected: { label: 'Declined', tone: 'Returned' },
  withdrawn: { label: 'Withdrawn by the proposer', tone: 'Returned' },
};

/** What each kind of act is called where a person reads it. */
const KIND_LABEL: Record<string, string> = {
  'project:create': 'Register a development',
  'project:update': 'Amend a development',
  'project:archive': 'Delete a development',
  'project:restore': 'Restore a development',
  'project:close': 'Close a development out',
  'project:reopen': 'Reopen a development',
  'project:delete': 'Remove a development permanently',
  'contract:award': 'Record or award a contract package',
};

/** "04 Sep 2026, 14:31" — one format, whatever the browser's locale. */
const when = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, `
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export function Authorisations() {
  const { authRequired, account, can } = useAuth();
  // Read only where there is something to read. The fixtures answer with an
  // empty queue rather than refusing, so the offline build costs no request
  // and shows the sentence below instead.
  const { changes, loading, error, decide } = useChanges(authRequired);
  const [busy, setBusy] = useState<number | null>(null);
  const [deciding, setDeciding] = useState<{ id: number; action: 'approve' | 'reject' | 'withdraw' } | null>(null);
  const [note, setNote] = useState('');

  // A seat with no part in this control has nothing to do here. Said rather
  // than shown empty: an executive viewer who found a blank queue would not
  // know whether nothing was waiting or nothing was theirs to see.
  if (authRequired && !can.approve && !can.authorise && !can.administer) {
    return (
      <NotYourSeat title="Authorising changes is not part of your role">
        Changes to a development — registering, amending, deleting, closing out and awarding a
        package — are proposed by the PMO Controls Manager and authorised by the Director.
        Everything you read on the dashboards and in the registers has already been through
        that control.
      </NotYourSeat>
    );
  }

  if (!authRequired) {
    return (
      <div className="card"><div className="card-b">
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          The self-contained build has no accounts, so there is nobody to propose a change and
          nobody to authorise one: every act takes effect immediately, exactly as it always
          has. On the hosted platform the PMO Controls Manager proposes a change to a
          development — its name, its budget, its delivery route, deleting it, closing it out,
          awarding a package against it — and the Director authorises it before anything moves.
        </p>
      </div></div>
    );
  }

  const act = (id: number, action: 'approve' | 'reject' | 'withdraw', why: string) => {
    setBusy(id);
    void decide(id, action, why)
      .then(() => {
        toast(action === 'approve' ? 'Change authorised and applied'
          : action === 'reject' ? 'Change declined' : 'Proposal withdrawn');
        setDeciding(null);
        setNote('');
      })
      // The server states the rule that refused, and a 422 names the
      // reconciliation control the change would have broken. That sentence is
      // the whole point of running the controls at authorisation rather than
      // at proposal, so it is shown verbatim.
      .catch((err: unknown) => { toastError(err, 'The decision was refused'); })
      .finally(() => { setBusy(null); });
  };

  const pending = changes.filter((c) => c.state === 'pending');
  const decided = changes.filter((c) => c.state !== 'pending');

  return (
    <div className="fade-up">
      {error ? (
        <div className="card" style={{ marginBottom: 14 }}><div className="card-b">
          <p className="muted" style={{ fontSize: 12.5 }}>{`The queue could not be read: ${error}`}</p>
        </div></div>
      ) : null}

      <p className="muted" style={{ fontSize: 11.5, marginBottom: 12, lineHeight: 1.7 }}>
        {'Every development’s proposals, whatever the scope selector says. A proposal has moved '
          + 'nothing: the change is applied at the moment it is authorised, and the twenty '
          + 'reconciliation controls run then, not now — so a proposal can still be refused on '
          + 'its merits when the position has moved underneath it.'}
      </p>

      {loading && changes.length === 0 && (
        <div className="card"><div className="card-b">
          <p className="muted" style={{ fontSize: 12.5 }}>Reading the queue…</p>
        </div></div>
      )}

      {!loading && changes.length === 0 && (
        <div className="card"><div className="card-b">
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            Nothing is waiting. A proposal appears here when the PMO Controls Manager registers,
            amends, deletes, restores, closes out or reopens a development, or records a contract
            package against one.
          </p>
        </div></div>
      )}

      {[...pending, ...decided].map((c) => {
        const mine = account?.id === c.requestedBy;
        // WHO MAY DECIDE. Authorising is a capability, and the person who
        // proposed a change never authorises it — the database refuses that
        // too, by name, so this only decides which buttons are worth
        // offering. An administrator is exempt, as they are everywhere else,
        // and the card says so rather than letting it pass unremarked.
        const mayDecide = c.state === 'pending'
          && (can.authorise || can.administer) && (!mine || can.administer);
        const mayWithdraw = c.state === 'pending' && (mine || can.administer);
        const open = deciding?.id === c.id;

        return (
          <div className="card" style={{ marginBottom: 14 }} key={c.id}>
            <div className="card-h">
              <h3>{`#${c.id} · ${KIND_LABEL[c.kind] ?? c.kind}${c.projectId ? ` — ${c.projectId}` : ''}`}</h3>
              <Badge status={STATE[c.state].tone} label={STATE[c.state].label} />
            </div>
            <div className="card-b">
              {/* The SUMMARY is written from the payload itself, so the line a
                  Director decides from and the change that will be applied are
                  the same fact stated once. */}
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{c.summary}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.7, marginBottom: 10 }}>
                <span className="muted">Reason given: </span>{c.reason}
              </div>

              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                <div>{`Proposed by ${c.requestedBy} · ${when(c.requestedAt)}`}</div>
                {c.decidedBy && (
                  <div style={{ color: c.state === 'approved' ? 'var(--green)' : 'var(--red)' }}>
                    {`${c.state === 'approved' ? 'Authorised' : c.state === 'rejected' ? 'Declined' : 'Withdrawn'}`
                      + ` by ${c.decidedBy} · ${when(c.decidedAt)}`
                      + (c.decisionNote ? ` — ${c.decisionNote}` : '')}
                  </div>
                )}
              </div>

              {c.state === 'pending' && mine && !can.administer && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                  You proposed this change, so you cannot authorise it. You can withdraw it.
                </p>
              )}
              {c.state === 'pending' && mine && can.administer && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                  You proposed this change. Your seat is exempt from separation of duties, so you
                  may authorise it — and your name will appear on both halves of the trail.
                </p>
              )}
              {c.state === 'pending' && !mayDecide && !mayWithdraw && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                  Waiting for the Director to authorise it.
                </p>
              )}

              {(mayDecide || mayWithdraw) && !open && (
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  {mayDecide && (
                    <button type="button" className="btn btn-gold" disabled={busy === c.id}
                      onClick={() => { setDeciding({ id: c.id, action: 'approve' }); setNote(''); }}>
                      {Ic('check', 15)}Authorise…
                    </button>
                  )}
                  {mayDecide && (
                    <button type="button" className="btn btn-ghost" disabled={busy === c.id}
                      onClick={() => { setDeciding({ id: c.id, action: 'reject' }); setNote(''); }}>
                      Decline…
                    </button>
                  )}
                  {mayWithdraw && (
                    <button type="button" className="btn btn-ghost" disabled={busy === c.id}
                      onClick={() => { setDeciding({ id: c.id, action: 'withdraw' }); setNote(''); }}>
                      Withdraw…
                    </button>
                  )}
                </div>
              )}

              {open && deciding && (
                <div style={{ marginTop: 14 }}>
                  <label htmlFor={`decide-note-${c.id}`} style={{ fontSize: 12, fontWeight: 600 }}>
                    {deciding.action === 'approve' ? 'What is the authorisation record? '
                      : deciding.action === 'reject' ? 'Why is it being declined? '
                        : 'Why is it being withdrawn? '}
                    <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <textarea id={`decide-note-${c.id}`} value={note} rows={3} maxLength={2000}
                    onChange={(e) => { setNote(e.target.value); }}
                    placeholder={deciding.action === 'approve'
                      ? 'e.g. Approved at the portfolio review on 8 September 2026'
                      : 'What the proposer needs to know'}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 8,
                      borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }} />
                  {/* A control that refuses in silence reads as a broken one.
                      The note is the record of the decision — the one thing a
                      reader a year from now will have — so the requirement is
                      stated rather than left to a button that does nothing. */}
                  {!note.trim() && (
                    <div className="form-hint">
                      Required. This is the record of the decision, and it is what the person who
                      proposed the change will read.
                    </div>
                  )}
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn btn-gold"
                      disabled={busy === c.id || !note.trim()}
                      onClick={() => { act(c.id, deciding.action, note.trim()); }}>
                      {deciding.action === 'approve' ? 'Authorise and apply'
                        : deciding.action === 'reject' ? 'Decline this change' : 'Withdraw it'}
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={busy === c.id}
                      onClick={() => { setDeciding(null); setNote(''); }}>
                      Cancel
                    </button>
                  </div>
                  {deciding.action === 'approve' && (
                    <p className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.7 }}>
                      Authorising applies the change immediately, through the same reconciliation
                      controls as any other write. If the position has moved since it was
                      proposed and the change would now break one of them, it is refused here and
                      the control that failed is named.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
