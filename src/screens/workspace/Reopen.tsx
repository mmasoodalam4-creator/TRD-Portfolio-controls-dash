import { useState } from 'react';
import type { Project } from '@/domain/types';
import { useMutations, type Submission } from '@/state/DataProvider';
import { useMessages } from '@/state/MessagesProvider';
import { useAuth } from '@/state/AuthProvider';
import { Ic, toast, toastError } from '@/components';

/**
 * REOPENING AN APPROVED PERIOD.
 *
 * An approved period is the record of what the owner has spent, and the one
 * thing on this system a person should not be able to quietly change. So the
 * month strip locks it, and the way back depends on who is asking:
 *
 *   The PMO manager RETURNS it. That already existed — it is the same act as
 *   returning a period from Review & Approve, through the same route, with the
 *   same audit trail. What was missing was a way to reach it from the month
 *   you are looking at rather than from a queue.
 *
 *   Everybody else REQUESTS it. The request is a MESSAGE to the PMO manager,
 *   not a mutation, and that is the correct shape rather than a shortcut: it
 *   moves no figure, it is append-only, and "I asked for October to be
 *   reopened on the 4th" is exactly the kind of claim the message table exists
 *   to settle. Inventing a mutation kind for it would put a request that
 *   changes nothing into the change log, which is the log of things that did.
 *
 * A REASON IS REQUIRED EITHER WAY, and the button says so while it is missing.
 * The date and the actor are recorded by the system; why an approved figure
 * had to move is the only part nobody can reconstruct a year later.
 *
 * Where there is no signed-in account — the self-contained build — there is
 * nobody to ask and nobody to return it, and the panel says that instead of
 * offering a button that would do nothing.
 */
export function Reopen({ p, submission, period, onDone }: {
  p: Project;
  submission: Submission;
  /** "October 2026", for the message and the confirmation. */
  period: string;
  onDone?: () => void;
}) {
  const { actOnSubmission } = useMutations();
  const { people, available, send } = useMessages();
  const { authRequired, account } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const mayReturn = !authRequired || account?.role === 'approver' || account?.role === 'admin';
  const reason = note.trim();

  // Who a request goes to. The approvers, and the administrators behind them —
  // addressed by seat rather than by name, so a request does not go stale the
  // day somebody changes job.
  const approvers = people.filter((x) => x.active && (x.role === 'approver' || x.role === 'admin'));

  const submit = (): void => {
    if (!reason || busy) return;
    setBusy(true);
    const done = () => { setBusy(false); };

    if (mayReturn) {
      actOnSubmission(submission.id, 'return', reason)
        .then(() => {
          toast('Period returned', `${p.id} · ${period} is back with the project manager`);
          setOpen(false);
          setNote('');
          onDone?.();
        })
        .catch((err: unknown) => { toastError(err, 'The period was not returned'); })
        .finally(done);
      return;
    }

    const body = `Request to reopen ${period} on ${p.id} (${p.name}), period ${submission.period}. ${reason}`;
    Promise.all(approvers.map((x) => send(x.id, body, p.id)))
      .then(() => {
        toast('Request sent', `${approvers.length} approver${approvers.length === 1 ? '' : 's'} asked to reopen ${period}`);
        setOpen(false);
        setNote('');
        onDone?.();
      })
      .catch((err: unknown) => { toastError(err, 'The request was not sent'); })
      .finally(done);
  };

  // Nobody to ask, and nobody to return it.
  if (!mayReturn && (!available || approvers.length === 0)) {
    return (
      <span className="form-hint" style={{ marginTop: 0 }}>
        {available
          ? 'No approver is currently active, so there is nobody to ask.'
          : 'Reopening an approved period needs the hosted platform, where there is a PMO manager to ask.'}
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); }}>
        {Ic(mayReturn ? 'edit' : 'message', 14)}
        {mayReturn ? 'Return period for correction' : 'Request to reopen'}
      </button>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12, background: 'var(--bg)', width: '100%' }}>
      <div className="card-b">
        <div className="between" style={{ marginBottom: 8 }}>
          <h3 style={{ fontSize: 14 }}>
            {mayReturn ? `Return ${period} for correction` : `Request to reopen ${period}`}
          </h3>
          <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Cancel"
            onClick={() => { setOpen(false); }}>{Ic('x', 15)}</button>
        </div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>
          {mayReturn
            ? 'The period goes back to the project manager and its figures unlock for them alone. '
              + 'It then passes through validation and approval again — it does not return to approved '
              + 'because it was approved once.'
            : 'This does not open the form. It asks the PMO manager to return the period; the figures '
              + 'unlock only if they do, and both the request and their decision are recorded.'}
        </p>
        <div className="form-field">
          <label htmlFor="ro-note">
            {mayReturn ? 'Why it is being returned' : 'What needs correcting, and why'}
          </label>
          <textarea id="ro-note" rows={3} value={note} autoFocus
            placeholder="e.g. Cost incurred on 5.0 MEP includes 2.1M that belongs to November"
            onChange={(e) => { setNote(e.target.value); }} />
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={!reason || busy} onClick={submit}>
            {Ic(mayReturn ? 'check' : 'message', 15)}
            {mayReturn ? 'Return the period' : 'Send the request'}
          </button>
          {!reason && (
            <span className="form-hint" style={{ marginTop: 0 }}>
              A reason is required. It is the only part of this a reader a year from now cannot
              reconstruct.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
