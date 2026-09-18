// ==========================================================================
// SUBMISSIONS — the review and approval queue
//
// Where the reviewer validates and the approver signs off. A period filed by
// a contributor is not part of the reported position until it has passed
// through both.
//
// The actions offered here are shaped to the role, but shaping is not
// enforcement: the server refuses what the role may not do, and the database
// refuses what nobody may do — reviewing or approving your own submission,
// whoever you are. If this screen ever offers a button it should not, the
// worst outcome is a refusal with a reason, not a bad write.
//
// On the self-contained build the queue is always empty: there is nobody to
// review a period, so entry takes effect at once and this screen says so.
// ==========================================================================
import { useState } from 'react';
import { fmt } from '@/domain/format';
import { positionFromPackages } from '@/domain/calc';
import { useMutations, type Submission } from '@/state/DataProvider';
import { useAuth } from '@/state/AuthProvider';
import { toast, toastError, Badge } from '@/components';
import { NotYourSeat } from './NotYourSeat';

/** How each state reads, and which badge tone carries it. */
const STATE_LABEL: Record<Submission['state'], string> = {
  submitted: 'Awaiting validation',
  reviewed: 'Awaiting approval',
  approved: 'Approved',
  returned: 'Returned',
};

const STATE_TONE: Record<Submission['state'], string> = {
  submitted: 'Awaiting review',
  reviewed: 'Validated',
  approved: 'Approved',
  returned: 'Returned',
};

/** "04 Sep 2026, 14:31" — one format, whatever the browser's locale. */
const when = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, `
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

/** Who acted, and when — the provenance the audit trail exists to carry. */
function Trail({ s }: { s: Submission }) {
  return (
    <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
      <div>{`Entered by ${s.submittedBy} · ${when(s.submittedAt)}`}</div>
      {s.reviewedBy && <div>{`Validated by ${s.reviewedBy} · ${when(s.reviewedAt)}`}</div>}
      {s.approvedBy && <div>{`Approved by ${s.approvedBy} · ${when(s.approvedAt)}`}</div>}
      {s.returnedBy && (
        <div style={{ color: 'var(--red)' }}>
          {`Returned by ${s.returnedBy} · ${when(s.returnedAt)}${s.returnedNote ? ` — ${s.returnedNote}` : ''}`}
        </div>
      )}
    </div>
  );
}

export function Submissions() {
  const { submissions, actOnSubmission } = useMutations();
  const { account, authRequired, can } = useAuth();
  const [busy, setBusy] = useState<number | null>(null);
  const [returning, setReturning] = useState<number | null>(null);
  const [note, setNote] = useState('');

  // A seat with no part in the reporting workflow reads the position, not the
  // workflow behind it. There is nothing here for them to act on and nothing
  // they may see that the reported figures do not already say. Asked of the
  // seat's FLAGS, not its name: the Director authorises changes to a
  // development and takes no part in a period, and would otherwise have been
  // shown a queue of things nobody was waiting on them for.
  if (authRequired && !can.input && !can.review && !can.approve && !can.administer) {
    return (
      <NotYourSeat title="The review workflow is not part of your role">
        Filed periods are validated by the portfolio manager and approved by the director.
        Your seat reads the position once it has been approved — everything on the dashboard
        and in the registers has already been through this workflow.
      </NotYourSeat>
    );
  }

  const mayValidate = can.review || can.administer;
  const mayApprove = can.approve || can.administer;
  const mayReturn = mayValidate || mayApprove;

  const act = (id: number, action: 'review' | 'approve' | 'return', why?: string) => {
    setBusy(id);
    void actOnSubmission(id, action, why)
      .then(() => {
        toast(action === 'approve' ? 'Period approved and reported'
          : action === 'review' ? 'Period validated' : 'Period returned to the contributor');
        setReturning(null);
        setNote('');
      })
      // The server and the database both answer with the rule that refused.
      // Showing it verbatim is the point: "you cannot approve your own
      // submission" is the control doing its job, not an error to swallow.
      .catch((err: unknown) => { toastError(err, 'The action was refused'); })
      .finally(() => { setBusy(null); });
  };

  if (!authRequired) {
    return (
      <div className="card"><div className="card-b">
        <p className="muted">
          The self-contained build has no review workflow — there is nobody to review a
          period, so entry takes effect immediately. Review and approval exist on the
          hosted platform, where input, validation and sign-off are three different people.
        </p>
      </div></div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="card"><div className="card-b">
        <p className="muted">No reporting periods have been filed yet. A contributor files one from Period Entry.</p>
      </div></div>
    );
  }

  return (
    <div className="fade-up">
      {/* The queue is deliberately unscoped — a reviewer works the whole
          portfolio's filings — and it is the one sidebar module that neither
          follows the selector nor said so. Each card names its development. */}
      {submissions.length > 0 && (
        <p className="muted" style={{ fontSize: 11.5, marginBottom: 12 }}>
          Every development&rsquo;s filings, whatever the scope selector says.
        </p>
      )}
      {submissions.map((s) => {
        // Null for a reader on a period that is not yet approved. The card
        // then reports the state and the provenance, and says plainly why
        // there are no figures on it.
        const position = s.payload ? positionFromPackages(s.payload.packages) : null;
        const mine = account?.id === s.submittedBy;
        const validatedByMe = account?.id === s.reviewedBy;
        const open = s.state !== 'approved';

        // What THIS person may do to THIS submission. Offering a button the
        // server will refuse is not wrong, but a controls system should not
        // invite an action and then decline it.
        const canValidate = open && s.state === 'submitted' && mayValidate && !mine;
        const canApprove = open && s.state === 'reviewed' && mayApprove && !mine && !validatedByMe;
        const canReturn = open && s.state !== 'returned' && mayReturn && !mine;

        return (
          <div className="card" style={{ marginBottom: 14 }} key={s.id}>
            <div className="card-h">
              <h3>{`${s.projectId} — period ${s.period}${s.dataDate ? ` · ${s.dataDate}` : ''}`}</h3>
              <Badge status={STATE_TONE[s.state]} label={STATE_LABEL[s.state]} />
            </div>
            <div className="card-b">
              {position && s.payload ? (
                <div className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginBottom: 14 }}>
                  {([
                    ['Planned Value', position.pv],
                    ['Earned Value', position.ev],
                    ['Cost Incurred', position.actual],
                    ['Approved Budget', s.payload.budget],
                  ] as const).map(([label, value]) => (
                    <div className="kpi" key={label}>
                      <div className="kpi-l">{`${label} (SAR)`}</div>
                      <div className="kpi-v">{fmt(value)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginBottom: 14 }}>
                  The figures in this period are not shown because it has not been approved.
                  Approval is what publishes them. Until then you can see that it was filed and
                  who is holding it.
                </p>
              )}

              <Trail s={s} />

              {mine && open && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                  You entered this period, so you cannot validate, approve or return it.
                </p>
              )}
              {validatedByMe && s.state === 'reviewed' && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                  You validated this period, so a different person must approve it.
                </p>
              )}
              {open && !mine && !canValidate && !canApprove && !canReturn && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                  {s.state === 'submitted' ? 'Awaiting validation by a reviewer.'
                    : s.state === 'reviewed' ? 'Awaiting approval by an approver.'
                    : 'Returned to the contributor for correction.'}
                </p>
              )}

              {(canValidate || canApprove || canReturn) && returning !== s.id && (
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  {canValidate && (
                    <button className="btn" disabled={busy === s.id}
                      onClick={() => { act(s.id, 'review'); }}>
                      Validate
                    </button>
                  )}
                  {canApprove && (
                    <button className="btn primary" disabled={busy === s.id}
                      onClick={() => { act(s.id, 'approve'); }}>
                      Approve and report
                    </button>
                  )}
                  {canReturn && (
                    <button className="btn" disabled={busy === s.id}
                      onClick={() => { setReturning(s.id); setNote(''); }}>
                      Return…
                    </button>
                  )}
                </div>
              )}

              {returning === s.id && (
                <div style={{ marginTop: 14 }}>
                  <label htmlFor={`return-note-${s.id}`} style={{ fontSize: 12, fontWeight: 600 }}>
                    {'Why is this period being returned? '}
                    <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <textarea id={`return-note-${s.id}`} value={note} rows={3} maxLength={2000}
                    onChange={(e) => { setNote(e.target.value); }}
                    placeholder="What the contributor needs to correct"
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 8, borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }} />
                  {/* A control that refuses in silence reads as a broken one.
                      The note is what the contributor is given to work from,
                      so the requirement is stated rather than enforced by a
                      button that simply does nothing. */}
                  {!note.trim() && (
                    <div className="form-hint">
                      Required. The period cannot be returned until you say what needs correcting.
                    </div>
                  )}
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="btn primary" disabled={busy === s.id || !note.trim()}
                      onClick={() => { act(s.id, 'return', note.trim()); }}>
                      Return with this note
                    </button>
                    <button className="btn btn-ghost" disabled={busy === s.id}
                      onClick={() => { setReturning(null); setNote(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
