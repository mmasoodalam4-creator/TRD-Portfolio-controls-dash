import { useRef, useState } from 'react';
import type { ExtractedDocument } from '@/state/DataProvider';
import { fmt } from '@/domain/format';
import { useAi, useMutations, useProjects } from '@/state/DataProvider';
import { Ic, toast, toastError } from '@/components';

/** What the reader accepts, matched to the route's own list. */
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic';

/** "48,500,000" or "48500000" → 48500000; NaN otherwise. */
const parseMoney = (raw: string): number => {
  const cleaned = raw.replace(/[,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
};

/** Green above 85, amber above 60, red below — and grey for a field left null. */
function confidenceTone(pct: number, filled: boolean): string {
  if (!filled) return 'b-grey';
  return pct >= 85 ? 'b-green' : pct >= 60 ? 'b-amber' : 'b-red';
}

type Stage = 'upload' | 'reading' | 'review' | 'done';

/**
 * Reading a real document, on a deployment that has a model.
 *
 * Separate from the scripted demonstration in AIExtract on purpose. That one
 * reads a fixed certificate and says so on its own face, which is honest when
 * there is nothing behind it and unacceptable when there is a real payment
 * register in front of it.
 *
 * THE MODEL FILLS THE FORM. IT DOES NOT FILE ANYTHING.
 *
 * What comes back lands in editable fields with a confidence beside each, and
 * the person decides. Pressing Create files an ordinary `ipc` mutation through
 * `commit`, which the server puts through all twenty reconciliation controls
 * before it writes — the same road a typed certificate travels. There is no
 * path from this screen to the database that skips them.
 *
 * The confidences are the point of the review, not decoration. A field the
 * reader could not make out comes back null with a low confidence, and the row
 * says so rather than showing a plausible number in a box.
 */
export function RealExtract({ onClose }: { onClose: () => void }) {
  const { extract } = useAi();
  const { commit } = useMutations();
  const projects = useProjects();
  const file = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>('upload');
  const [filename, setFilename] = useState('');
  const [read, setRead] = useState<ExtractedDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  // The form, seeded from what was read and editable throughout.
  const [projectId, setProjectId] = useState('');
  const [reference, setReference] = useState('');
  const [certified, setCertified] = useState('');
  const [retention, setRetention] = useState('');

  const chosen = projects.find((p) => p.id === projectId);
  const certifiedValue = parseMoney(certified);
  const retentionValue = retention.trim() === '' ? 0 : parseMoney(retention);
  // Control 15: what has been certified may never exceed the cost incurred.
  // Shown here so the refusal is understood before it happens rather than
  // arriving as a 422 after the person pressed the button.
  const headroom = chosen ? chosen.actual - chosen.ipcSubmitted : 0;

  const problems: Record<string, string> = {};
  if (!projectId) problems.projectId = 'Which development is this certificate for?';
  if (!reference.trim()) problems.reference = 'A certificate reference is required';
  if (!Number.isFinite(certifiedValue) || certifiedValue <= 0) problems.certified = 'Whole riyals, digits only';
  else if (chosen && certifiedValue > headroom) {
    problems.certified = `Exceeds cost incurred: only ${fmt(Math.max(0, headroom))} SAR of actual cost is not yet certified`;
  }
  if (!Number.isFinite(retentionValue) || retentionValue < 0) problems.retention = 'Whole riyals, digits only';
  else if (Number.isFinite(certifiedValue) && retentionValue > certifiedValue) {
    problems.retention = 'Retention cannot exceed the certified value';
  }
  const valid = Object.keys(problems).length === 0;

  const send = (chosenFile: File): void => {
    setFilename(chosenFile.name);
    setStage('reading');
    chosenFile.arrayBuffer()
      .then((bytes) => extract(bytes, chosenFile.type || 'application/pdf'))
      .then((got) => {
        setRead(got);
        setProjectId(got.projectId ?? '');
        setReference(got.reference ?? '');
        setCertified(got.certified === null ? '' : String(got.certified));
        setRetention(got.retention === null ? '' : String(got.retention));
        setStage('review');
      })
      .catch((err: unknown) => {
        toastError(err, 'The document could not be read');
        setStage('upload');
      })
      .finally(() => { if (file.current) file.current.value = ''; });
  };

  const create = (): void => {
    setTried(true);
    if (!valid || busy) return;
    setBusy(true);
    commit({
      kind: 'ipc',
      at: new Date().toISOString(),
      projectId,
      certified: Math.round(certifiedValue),
      retention: Math.round(retentionValue),
      reference: reference.trim(),
    }).then(() => {
      setStage('done');
      toast('Certificate recorded', `${reference.trim()} added to the ${projectId} register`);
      setTimeout(onClose, 2200);
    }).catch((err: unknown) => {
      toastError(err, 'Certificate refused');
      setBusy(false);
    });
  };

  const error = (key: string) => (tried && problems[key]
    ? <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{problems[key]}</div>
    : null);

  /** One read field, with the reader's confidence beside it. */
  const row = (
    label: string, value: string, set: (v: string) => void,
    pct: number, key: string, placeholder?: string,
  ) => (
    <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 190px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', paddingTop: 8 }}>
        {label}
      </div>
      <div style={{ flex: 1 }}>
        <input value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)}
          style={{
            width: '100%', border: '1px solid var(--line)', borderRadius: 8,
            padding: '7px 10px', fontSize: 12.5, fontWeight: 600,
          }} />
        {error(key)}
      </div>
      <span className={`badge ${confidenceTone(pct, value.trim() !== '')}`}
        style={{ minWidth: 60, justifyContent: 'center', marginTop: 6 }}
        title={value.trim() ? 'How sure the reader was of this field' : 'The reader could not make this field out'}>
        {value.trim() ? `${pct}%` : 'not read'}
      </span>
    </div>
  );

  const header = (
    <div className="modal-h">
      <div className="row" style={{ gap: 10 }}>
        <div className="kpi-ic" style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#2f6dd0,#1e56b0)' }}>
          {Ic('ai', 18, '#fff')}
        </div>
        <h2>Read a Document</h2>
      </div>
      <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Close"
        onClick={busy || stage === 'reading' ? undefined : onClose}>{Ic('x', 17)}</button>
    </div>
  );

  return (
    <div className="modal-scrim" onClick={busy || stage === 'reading' ? undefined : onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        {header}

        <div className="modal-b">
          {stage === 'upload' && (
            <div>
              <div className="row" style={{
                gap: 10, marginBottom: 14, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.55,
                background: 'var(--blue-bg)', borderRadius: 10, border: '1px solid #cfe0f6',
              }}>
                {Ic('shield2', 18, '#2F6DD0')}
                <div>
                  <b>Reading fills the form; it files nothing.</b> Every field comes back editable
                  with how sure the reader was of it. Nothing reaches the register until you press
                  Create, and it goes through the same reconciliation controls as a typed entry.
                </div>
              </div>

              <input ref={file} type="file" hidden accept={ACCEPT}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); }} />

              <div
                role="button" tabIndex={0}
                style={{
                  border: '2px dashed #c6d2e6', borderRadius: 14, padding: '44px 20px',
                  textAlign: 'center', background: 'var(--bg)', cursor: 'pointer',
                }}
                onClick={() => file.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter') file.current?.click(); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) send(dropped);
                }}
              >
                <div className="kpi-ic" style={{ width: 60, height: 60, background: 'var(--blue-bg)', margin: '0 auto 16px' }}>
                  {Ic('upload', 30, '#2F6DD0')}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Drop a document here or click to choose one</div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Payment certificates and claims, as PDF, JPG, PNG, WEBP or HEIC
                </p>
                <button type="button" className="btn btn-ai" style={{ marginTop: 16 }}>
                  {Ic('ai', 15)}Select Document
                </button>
              </div>
            </div>
          )}

          {stage === 'reading' && (
            <div style={{ textAlign: 'center', padding: '48px 10px' }}>
              <div className="kpi-ic pulse" style={{ width: 60, height: 60, background: 'var(--blue-bg)', margin: '0 auto 18px' }}>
                {Ic('ai', 30, '#2F6DD0')}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Reading {filename}</div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                This takes a few seconds. Nothing is written while it reads.
              </p>
            </div>
          )}

          {stage === 'review' && read && (
            <div className="fade-up">
              <div className="row" style={{
                gap: 10, marginBottom: 16, padding: '12px 16px',
                background: 'var(--amber-bg)', borderRadius: 10, border: '1px solid #f0d9ae', color: '#7a5a1f',
              }}>
                {Ic('alert', 20, '#E0902B')}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {read.documentType ? `Read as: ${read.documentType}` : 'Document type not identified'}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                    Check every figure against the document before you create the entry. A field
                    marked <b>not read</b> was one the reader could not make out — it has not been
                    guessed for you.
                  </div>
                </div>
              </div>

              {read.notes && (
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
                  <b>Reader&rsquo;s note:</b> {read.notes}
                </div>
              )}

              <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 190px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', paddingTop: 8 }}>
                  Development
                </div>
                <div style={{ flex: 1 }}>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                    style={{
                      width: '100%', border: '1px solid var(--line)', borderRadius: 8,
                      padding: '7px 10px', fontSize: 12.5, fontWeight: 600,
                    }}>
                    <option value="">Choose the development</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{`${p.id} — ${p.name}`}</option>)}
                  </select>
                  {error('projectId')}
                  {chosen && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {`${fmt(chosen.ipcSubmitted)} SAR certified against ${fmt(chosen.actual)} SAR incurred`}
                    </div>
                  )}
                </div>
                <span className={`badge ${confidenceTone(read.confidence.projectId, projectId !== '')}`}
                  style={{ minWidth: 60, justifyContent: 'center', marginTop: 6 }}>
                  {projectId ? `${read.confidence.projectId}%` : 'not read'}
                </span>
              </div>

              {row('Certificate reference', reference, setReference, read.confidence.reference, 'reference', 'e.g. IPC-08')}
              {row('Certified this document (SAR)', certified, setCertified, read.confidence.certified, 'certified', 'digits only')}
              {row('Retention withheld (SAR)', retention, setRetention, read.confidence.retention, 'retention', '0 if none')}

              <div style={{ borderTop: '1px solid var(--line)', margin: '14px 0 12px' }} />
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.65 }}>
                {read.contractor && <>Contractor as read: <b>{read.contractor}</b>. </>}
                {read.period && <>Period as read: <b>{read.period}</b>. </>}
                A certificate moves what has been certified and what has been paid, net of
                retention. It does not move earned value or actual cost — those come from the
                reporting period, which is why a period covering the work is filed first.
              </div>
            </div>
          )}

          {stage === 'done' && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div className="kpi-ic" style={{ width: 64, height: 64, background: 'var(--green-bg)', margin: '0 auto 16px' }}>
                {Ic('check', 34, 'var(--green)')}
              </div>
              <h2 style={{ fontSize: 18 }}>Certificate recorded</h2>
              <p className="muted" style={{ marginTop: 6 }}>
                {`${reference.trim()} added to the ${projectId} register. Certified `
                  + `${fmt(Math.round(certifiedValue))} SAR, retention `
                  + `${fmt(Math.round(retentionValue))} SAR withheld, `
                  + `${fmt(Math.round(certifiedValue - retentionValue))} SAR paid.`}
              </p>
            </div>
          )}
        </div>

        <div className="modal-f">
          {stage === 'review' ? (
            <>
              <button className="btn btn-ghost" disabled={busy}
                onClick={() => { setStage('upload'); setRead(null); setTried(false); }}>
                Read another
              </button>
              <button className="btn btn-gold" disabled={busy} onClick={create}>
                {Ic('check', 15)}{busy ? 'Recording…' : 'Create the entry'}
              </button>
            </>
          ) : stage === 'done' ? (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          ) : stage === 'upload' ? (
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
