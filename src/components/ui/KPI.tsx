import type { ReactNode } from 'react';
import { Ic } from '../icons';

export type KpiTone = 'navy' | 'gold' | 'green' | 'red' | 'amber' | 'blue';

const TONES: Record<KpiTone, [string, string]> = {
  navy: ['#E8EDF5', 'var(--navy)'],
  gold: ['#FBF3D9', '#a07d12'],
  green: ['var(--green-bg)', 'var(--green)'],
  red: ['var(--red-bg)', 'var(--red)'],
  amber: ['var(--amber-bg)', 'var(--amber)'],
  blue: ['var(--blue-bg)', 'var(--blue)'],
};

interface KPIProps {
  icon: string;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KpiTone;
  onClick?: () => void;
}

/** Headline metric tile. Every value shown is an owner-side cost or an index. */
export function KPI({ icon, label, value, sub, tone, onClick }: KPIProps) {
  const [bg, fg] = TONES[tone ?? 'navy'];
  return (
    <div className={`kpi${onClick ? ' click' : ''}`} onClick={onClick}>
      <div className="kpi-top">
        <div className="kpi-ic" style={{ background: bg, color: fg }}>{Ic(icon, 20, fg)}</div>
        <div className="kpi-l">{label}</div>
      </div>
      <div className="kpi-v">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}
