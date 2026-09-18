import { useState, useEffect } from 'react';
import { fmt } from '@/domain/format';
import { aiIsSimulated, useAi, useMutations } from '@/state/DataProvider';
import { Ic, toast, toastError, useEscape } from '@/components';
import { RealExtract } from './RealExtract';

/** The certificate the extraction reads, in SAR. */
const CERTIFIED = 48_500_000;
const RETENTION = 4_850_000;

const STEPS = [
  'Reading document...',
  'Identifying document type...',
  'Extracting key fields...',
  'Validating against register...',
  'Checking for duplicates...',
];

/** Extracted fields with the model's confidence in each. */
const FIELDS: [string, string, number][] = [
  ['Document Type', 'IPC / Payment Certificate', 98],
  ['Project', 'RES-01 Naseem Residences', 97],
  ['IPC Number', 'IPC-08', 99],
  ['Period', 'August 2026', 96],
  ['Contractor', 'Al Rajhi Contracting', 95],
  ['Work Done This Period (SAR)', '48,500,000', 94],
  ['Cumulative Certified (SAR)', '720,000,000', 96],
  ['Retention (10%)', '4,850,000', 99],
  ['Net Payable (SAR)', '43,650,000', 93],
];

type Stage = 'upload' | 'processing' | 'review' | 'done';

/**
 * AI document extraction — the first of the demo's two hero flows.
 *
 * A PMC submits an IPC; today someone retypes it. This reads the certificate,
 * scores each field, and creates the register entry on approval. The figures
 * extracted are amounts the owner owes the contractor — costs, and the
 * retention held against them.
 *
 * The extraction below is SCRIPTED — a fixed certificate, fixed fields, fixed
 * confidences. That is honest in the self-contained demo and unacceptable in
 * the platform, where the same flow would commit an invented IPC into a real
 * payment register. `aiIsSimulated` is what keeps those two apart.
 */
/**
 * The development the scripted sample certificate names. The commit files
 * against THIS id — the one the review pane shows — never against the scope's
 * hidden drill-in project: with the selector on COM-01 the review pane said
 * RES-01 and the certificate landed on COM-01, which is a review screen
 * approving one thing and filing another.
 */
const SAMPLE_PROJECT = 'RES-01';

export function AIExtract({ onClose }: { onClose: () => void }) {
  const { commit } = useMutations();
  const { status } = useAi();
  const [stage, setStage] = useState<Stage>('upload');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  useEscape(stage === 'processing' ? () => undefined : onClose);

  useEffect(() => {
    if (stage !== 'processing') return;
    if (step < STEPS.length) {
      const t = setTimeout(() => setStep(step + 1), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage('review'), 500);
    return () => clearTimeout(t);
  }, [stage, step]);

  const header = (
    <div className="modal-h">
      <div className="row" style={{ gap: 10 }}>
        <div className="kpi-ic" style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#2f6dd0,#1e56b0)' }}>
          {Ic('ai', 18, '#fff')}
        </div>
        <h2>AI Document Extraction</h2>
      </div>
      <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>{Ic('x', 17)}</button>
    </div>
  );

  // Three builds, three behaviours, and the distinction is the whole point.
  //
  //   offline           the scripted demonstration below, which says on its
  //                     own face that it reads a fixed sample
  //   platform + model  the real reader, in RealExtract
  //   platform, no key  nothing, and it says so
  //
  // A fabricated certificate must never reach a real payment register, which
  // is why the scripted flow is unreachable the moment there is a database
  // behind the application.
  if (!aiIsSimulated && status?.configured) {
    return <RealExtract onClose={onClose} />;
  }

  // Still deciding whether there is a model. Better a moment of nothing than
  // a flash of "not configured" on a deployment that is configured.
  if (!aiIsSimulated && status === null) {
    return (
      <div className="modal-scrim" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          {header}
          <div className="modal-b">
            <div className="muted" style={{ textAlign: 'center', padding: '40px 10px', fontSize: 12.5 }}>
              Checking what this deployment can read…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!aiIsSimulated) {
    return (
      <div className="modal-scrim" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          {header}
          <div className="modal-b">
            <div style={{ textAlign: 'center', padding: '26px 10px' }}>
              <div className="kpi-ic" style={{ width: 56, height: 56, background: 'var(--blue-bg)', margin: '0 auto 16px' }}>
                {Ic('ai', 28, '#2F6DD0')}
              </div>
              <h2 style={{ fontSize: 17 }}>Document extraction is not configured</h2>
              <p className="muted" style={{ marginTop: 8, maxWidth: 420, margin: '8px auto 0' }}>
                No extraction model is connected to this deployment, so there is nothing
                to read your document with. Rather than show a sample result, this build
                does nothing — an invented certificate in the payment register would be
                worse than no certificate at all.
              </p>
              <p className="muted" style={{ marginTop: 12, maxWidth: 420, margin: '12px auto 0', fontSize: 12 }}>
                Enter the period through <strong>Period Entry</strong>, by hand or from the
                project workbook. Every figure there is reconciled before it is filed.
              </p>
            </div>
          </div>
          <div className="modal-f">
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-scrim" onClick={stage === 'processing' ? undefined : onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        {header}

        <div className="modal-b">
          {stage === 'upload' ? (
            <div>
              <div className="row" style={{
                gap: 10, marginBottom: 14, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.5,
                background: 'var(--amber-bg)', borderRadius: 10, border: '1px solid #f0d9ae', color: '#7a5a1f',
              }}>
                {Ic('alert', 18, '#E0902B')}
                <div>
                  <b>Demonstration.</b> This build has no extraction model connected: whatever is
                  dropped here, the flow reads a fixed sample certificate (IPC-08, RES-01). The
                  entry it creates is real and goes through the same controls as a typed one.
                </div>
              </div>
              <div
                style={{
                  border: '2px dashed #c6d2e6', borderRadius: 14, padding: '44px 20px',
                  textAlign: 'center', background: 'var(--bg)', cursor: 'pointer',
                }}
                onClick={() => setStage('processing')}
              >
                <div className="kpi-ic" style={{ width: 60, height: 60, background: 'var(--blue-bg)', margin: '0 auto 16px' }}>
                  {Ic('upload', 30, '#2F6DD0')}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Drop a document here or click to upload</div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Supports IPC certificates, variation orders, invoices, NCRs, and progress reports (PDF, JPG, PNG)
                </p>
                <button type="button" className="btn btn-ai" style={{ marginTop: 16 }}>{Ic('ai', 15)}Select Document</button>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 16, justifyContent: 'center' }}>
                {['IPC Certificate', 'Variation Order', 'Invoice', 'NCR', 'Progress Report'].map((t) => (
                  <span key={t} className="chip" style={{ cursor: 'pointer' }} onClick={() => setStage('processing')}>{t}</span>
                ))}
              </div>
            </div>
          ) : stage === 'processing' ? (
            <div style={{ padding: '20px 0' }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: '0 0 200px' }}>
                  <div style={{
                    border: '1px solid var(--line)', borderRadius: 10, height: 260,
                    background: '#fff', padding: 14, boxShadow: 'var(--shadow)',
                  }}>
                    <div style={{ height: 16, background: '#e9edf4', borderRadius: 4, width: '70%', marginBottom: 8 }} />
                    <div style={{ height: 10, background: '#f0f3f8', borderRadius: 4, marginBottom: 6 }} />
                    <div style={{ height: 10, background: '#f0f3f8', borderRadius: 4, width: '90%', marginBottom: 6 }} />
                    <div style={{ height: 10, background: '#f0f3f8', borderRadius: 4, width: '80%', marginBottom: 14 }} />
                    <div className="pulse" style={{ height: 60, background: 'var(--blue-bg)', borderRadius: 6, marginBottom: 10 }} />
                    <div style={{ height: 10, background: '#f0f3f8', borderRadius: 4, width: '85%', marginBottom: 6 }} />
                    <div style={{ height: 10, background: '#f0f3f8', borderRadius: 4, width: '60%' }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 10, marginBottom: 20 }}>
                    {Ic('ai', 22, '#2F6DD0', 2)}
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Analysing the document</div>
                  </div>
                  {STEPS.map((s, i) => (
                    <div key={i} className="row" style={{ gap: 12, padding: '11px 0', opacity: i <= step ? 1 : 0.35, transition: 'opacity .3s' }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: i < step ? 'var(--green-bg)' : i === step ? 'var(--blue-bg)' : '#eef1f6',
                        color: i < step ? 'var(--green)' : 'var(--blue)',
                      }}>
                        {i < step ? Ic('check', 14) : i === step ? <div className="spin">{Ic('settings', 14)}</div> : <span>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: i === step ? 600 : 400 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : stage === 'review' ? (
            <div className="fade-up">
              <div className="row" style={{
                gap: 10, marginBottom: 16, padding: '12px 16px',
                background: 'var(--green-bg)', borderRadius: 10, border: '1px solid #b6e4c9',
              }}>
                {Ic('check', 20, 'var(--green)')}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Extraction complete — 9 fields identified</div>
                  <div style={{ fontSize: 12, color: '#2b7a52' }}>
                    Review the extracted data below, then create the register entry
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ flex: '0 0 180px' }}>
                  <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, background: '#fff', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--navy)' }}>IPC-08.pdf</div>
                    <div className="muted" style={{ lineHeight: 1.7 }}>
                      Payment Certificate No. 08<br />Al Rajhi Contracting<br />Period: August 2026<br />
                      Project: Naseem Residences<br /><br />Work Done: SAR 48.5M<br />
                      Retention: SAR 4.85M<br />Net: SAR 43.65M
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {FIELDS.map((f, i) => (
                    <div key={i} className="row" style={{ gap: 10, marginBottom: 9 }}>
                      <div style={{ flex: '0 0 190px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>{f[0]}</div>
                      <input defaultValue={f[1]} style={{
                        flex: 1, border: '1px solid var(--line)', borderRadius: 8,
                        padding: '7px 10px', fontSize: 12.5, fontWeight: 600,
                      }} />
                      <span className={`badge ${f[2] >= 97 ? 'b-green' : f[2] >= 94 ? 'b-amber' : 'b-red'}`}
                        style={{ minWidth: 52, justifyContent: 'center' }} title="Model confidence in this field">
                        {`${f[2]}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div className="kpi-ic" style={{ width: 64, height: 64, background: 'var(--green-bg)', margin: '0 auto 16px' }}>
                {Ic('check', 34, 'var(--green)')}
              </div>
              <h2 style={{ fontSize: 18 }}>IPC Entry Created</h2>
              <p className="muted" style={{ marginTop: 6 }}>
                {`IPC-08 has been added to the ${SAMPLE_PROJECT} payment register. Certified `
                  + `${fmt(CERTIFIED)} SAR, retention ${fmt(RETENTION)} SAR withheld, `
                  + `${fmt(CERTIFIED - RETENTION)} SAR paid. The cost position has been updated.`}
              </p>
            </div>
          )}
        </div>

        <div className="modal-f">
          {stage === 'review' ? [
            <button key={1} className="btn btn-ghost" onClick={onClose}>Cancel</button>,
            <button key={2} className="btn btn-gold" disabled={saving} onClick={() => {
              setSaving(true);
              void commit({
                kind: 'ipc',
                at: new Date().toISOString(),
                projectId: SAMPLE_PROJECT,
                certified: CERTIFIED,
                retention: RETENTION,
                reference: 'IPC-08',
              }).then(() => {
                setStage('done');
                toast('IPC Entry Created', `IPC-08 added to the ${SAMPLE_PROJECT} register`);
                setTimeout(onClose, 2200);
              }).catch((err: unknown) => {
                toastError(err, 'IPC entry refused');
                setSaving(false);
              });
            }}>{Ic('check', 15)}{saving ? 'Creating…' : 'Create IPC Entry'}</button>,
          ] : stage === 'done' ? (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          ) : stage === 'upload' ? (
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
