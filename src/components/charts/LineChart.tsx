import { useId } from 'react';
import { mn } from '@/domain/format';
import { ChartLegend } from './Legend';
import { niceScale } from './scale';

export interface LineSeries {
  name: string;
  color: string;
  /** null gaps the line — used where the EV/AC curves stop at the data date. */
  pts: (number | null)[];
  dash?: string;
}

/**
 * Earned-value style line chart: PV planned, EV earned, AC actual.
 *
 * The dimensional finish: a soft glow under each line and a white surface
 * ring on every marker, so overlapping series stay separable where they
 * cross; the LAST point of each series — the reported position — is drawn
 * larger, because it is the figure the tiles above the chart carry.
 *
 * IT DRAWS ITS OWN KEY. `name` was on `LineSeries` from the beginning and
 * nothing rendered it, so six of these charts named their series only in the
 * source. Above one series the key is drawn; at one series it is not, because
 * the card heading already names it. See `Legend.tsx`.
 *
 * `yLabel` and `xLabel` say what the numbers ARE. They are optional and meant
 * to be left off where the heading already carries the unit — "Exposure Trend
 * (SAR)" needs no second sentence — and passed where it does not: a workforce
 * axis reading 0 to 294 says nothing about people.
 */
export function LineChart({
  series, labels, h: ht = 210, yMax, money: isMoney, yLabel, xLabel, integer,
}: {
  series: LineSeries[];
  labels: string[];
  h?: number;
  yMax?: number;
  money?: boolean;
  yLabel?: string;
  xLabel?: string;
  /** A count axis — people, incidents, non-conformances. No half gridlines. */
  integer?: boolean;
}) {
  const uid = useId();
  const w = 560;
  // The y-axis title is drawn rotated INSIDE the left gutter, so the gutter
  // has to grow to hold it. At the standard 38 the tick labels already reach
  // x≈10 ("9.00B" is about 22px at this size) and the title would have been
  // painted straight through them.
  const pad = yLabel ? 54 : 38;
  const plotW = w - pad - 14;
  const plotH = ht - 30;
  // Likewise below: the month labels sit at ht-6, so an axis title needs its
  // own band under them rather than the same line.
  const H = ht + (xLabel ? 15 : 0);
  // The scale is chosen so every gridline lands on a number a reader can
  // name, and the label is that number — see charts/scale.ts. `yMax` is a
  // stated ceiling (a percentage runs to 100) and the scale still grows past
  // it rather than clipping.
  const peak = Math.max(0, ...series.flatMap((s) => s.pts.filter((v): v is number => v != null && Number.isFinite(v))));
  const scale = yMax != null && peak <= yMax
    ? { max: yMax, step: yMax / 4, count: 4, decimals: Number.isInteger(yMax / 4) ? 0 : 2 }
    : niceScale(peak, { integer });
  const max = scale.max;
  const xstep = plotW / (labels.length - 1);
  const X = (i: number) => pad + i * xstep;
  const Y = (v: number) => ht - 24 - (v / max) * plotH;
  const midY = (Y(0) + Y(max)) / 2;
  const ticks = Array.from({ length: scale.count + 1 }, (_, i) => i * scale.step);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={`${uid}glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0B2545" floodOpacity="0.20" />
          </filter>
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={pad} x2={w - 14} y1={Y(v)} y2={Y(v)} stroke="#eef1f6" />
            <text x={pad - 6} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="#9aa7bd">
              {isMoney ? mn(v) : v.toFixed(scale.decimals)}
            </text>
          </g>
        ))}
        {yLabel && (
          <text
            x={13} y={midY} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#6B7A90"
            transform={`rotate(-90 13 ${midY})`}
          >
            {yLabel}
          </text>
        )}
        {labels.map((l, i) => (
          <text key={i} x={X(i)} y={ht - 6} textAnchor="middle" fontSize={9} fill="#9aa7bd">{l}</text>
        ))}
        {xLabel && (
          <text x={pad + plotW / 2} y={H - 3} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#6B7A90">
            {xLabel}
          </text>
        )}
        {series.map((s, si) => {
          const pts = s.pts
            .map((v, i) => (v == null ? null : [X(i), Y(v)] as [number, number]))
            .filter((p): p is [number, number] => p !== null);
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.5}
                strokeDasharray={s.dash ?? '0'} strokeLinejoin="round"
                filter={`url(#${uid}glow)`} />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]}
                  r={i === pts.length - 1 ? 4.4 : 2.8}
                  fill={s.color} stroke="#fff" strokeWidth={i === pts.length - 1 ? 2 : 1.3} />
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <ChartLegend items={series.map((s) => ({
          name: s.name, color: s.color, dash: s.dash, mark: 'line',
        }))} />
      )}
    </div>
  );
}
