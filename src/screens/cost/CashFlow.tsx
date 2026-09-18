import { fmt, mn, pct } from '@/domain/format';
import { monthlyCost, DATA_DATE_INDEX } from '@/domain/forecast';
import { KPI, LineChart, Prog } from '@/components';
import { RecordCertificate } from './RecordCertificate';
import { useScopedRegisters } from '@/state/ScopeProvider';
import type { ScopePosition } from '@/domain/position';
import { MONTH_AXIS } from '@/domain/calendar';

const RETENTION_LABEL = 'Retention Held';

/**
 * Payment position: what has been certified, what has been paid, and what the
 * owner is holding.
 *
 * Every figure is money leaving or held back by the owner. Retention is a
 * withheld cost, not income.
 */
export function CashFlowTab({ p, months, scurve, canEdit = false }: {
  p: ScopePosition;
  months: string[];
  scurve: Parameters<typeof monthlyCost>[2];
  /** Whether this person may record a certificate here; the server decides finally. */
  canEdit?: boolean;
}) {
  // Retention is READ FROM THE CLAIMS REGISTER — what was withheld from each
  // claim at its own rate, less what has been released — exactly as the
  // Payment Claims module computes it. It used to be ASSUMED at a flat 10% of
  // certified, which is a second implementation of a figure the register
  // already carries, and the wrong one: on five of the eight developments the
  // assumption exceeded certified-less-paid, so this tab manufactured a red
  // "Paid above certified" exception out of a constant while control 14
  // passed beside it.
  const { claims } = useScopedRegisters();
  const retention = claims.reduce((a, c) => a + c.retention - c.released, 0);
  const certifiedNet = p.certified - retention;
  // Signed. A negative balance is payment above net certified value, which is
  // a finding, not "fully settled" — clamping it at zero hid it.
  const outstanding = certifiedNet - p.paid;
  const rows = monthlyCost(p, months, scurve);

  // Both curves follow the shape of actual cost and are pinned at the data
  // date: certified value equals IPC submitted there, and payments equal the
  // Payments Made tile exactly. The paid curve used to lag actual cost by a
  // period, which left it ending below the tile printed above it.
  const dd = Math.min(DATA_DATE_INDEX, rows.length - 1);
  const acAtDataDate = rows[dd]?.actualCum ?? 0;
  const pin = (target: number) => (i: number, actualCum: number | null): number | null => {
    if (actualCum === null) return null;
    if (i === dd) return target;
    return acAtDataDate ? Math.round(actualCum * (target / acAtDataDate)) : 0;
  };
  const paidCurve = rows.map((r, i) => pin(p.paid)(i, r.actualCum));
  const certifiedCurve = rows.map((r, i) => pin(p.certified)(i, r.actualCum));

  const outstandingSub = outstanding > 0 ? 'Certified, not yet paid'
    : outstanding < 0 ? 'Paid above certified' : 'Fully settled';
  const outstandingTone = outstanding > 0 ? 'amber' : outstanding < 0 ? 'red' : 'green';

  return (
    <div>
      {/* A certificate is filed against ONE development. At a roll-up there
          is no single answer, so the form is replaced by the sentence that
          says where to file it — a disabled control that says nothing is how
          a person concludes the system is broken. */}
      {canEdit && (p.project
        ? <RecordCertificate p={p.project} />
        : (
          <p className="form-hint">
            A certificate is recorded against one development. Choose it in the scope selector, or
            open it in the Project Workspace, and the form appears here.
          </p>
        ))}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))', marginBottom: 16 }}>
        <KPI icon="wallet" label="IPC Submitted (SAR)" value={mn(p.certified)} sub="Certified to owner" tone="blue" />
        <KPI icon="coins" label={`${RETENTION_LABEL} (SAR)`} value={mn(retention)}
          sub="Withheld on claims, less released" tone="navy" />
        <KPI icon="check" label="Net Certified (SAR)" value={mn(certifiedNet)} sub="After retention held" tone="green" />
        <KPI icon="wallet" label="Payments Made (SAR)" value={mn(p.paid)} sub={`${pct(p.paid, p.budget)} of Budget`} tone="gold" />
        <KPI icon="clock" label="Outstanding (SAR)" value={mn(outstanding)} sub={outstandingSub} tone={outstandingTone} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-h"><h3>Certification and Payment Curve</h3></div>
          <div className="card-b">
            <LineChart money labels={months} xLabel={MONTH_AXIS} series={[
              { name: 'IPC Certified', color: '#1E9E5A', pts: certifiedCurve },
              { name: 'Payments Made', color: '#2F6DD0', pts: paidCurve },
            ]} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Position Against Budget</h3></div>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {([
              ['Committed Cost', p.committed],
              ['IPC Submitted', p.certified],
              ['Payments Made', p.paid],
              [RETENTION_LABEL, retention],
            ] as const).map(([label, value], i) => (
              <div key={i}>
                <div className="between" style={{ marginBottom: 5 }}>
                  <span className="kv-l">{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(value)}</span>
                </div>
                <Prog v={p.budget ? Math.round((value / p.budget) * 100) : 0} />
              </div>
            ))}
            <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 2 }}>
              Retention is what the payment claims register says was withheld from each claim at
              its own rate, less what has been released at handover and closeout. It is cost
              withheld, not income.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
