import { useId } from 'react';
import { mn } from '@/domain/format';
import { shade } from './fx';
import { ChartLegend } from './Legend';
import { niceScale } from './scale';

export interface BarGroup {
  label: string;
  bars: { v: number; color: string }[];
}

/**
 * Grouped vertical bars — monthly cost trend and similar comparisons.
 *
 * The bars are EXTRUDED, and the extrusion is honest: parallel projection
 * with the SAME depth on every bar (see charts/fx.ts). A lit top face and a
 * shaded side face give the depth the owner asked for; the front face — the
 * one whose height encodes the value — is exactly the rectangle the flat
 * chart drew, on the same baseline and the same scale. Perspective 3D, where
 * a near bar looks taller than a far bar of the same value, is deliberately
 * not what this is.
 *
 * `series` NAMES THE BARS WITHIN EACH GROUP, in the order they are given, and
 * is what the key is drawn from. A `BarGroup` carries colours and no names, so
 * before this a grouped chart was a red bar beside a green one with nothing on
 * the page saying which was actual cost and which was earned value — the two
 * figures a reader is there to compare. Passing it is how a grouped chart gets
 * a key; a single-bar chart needs none, and its heading says what it is.
 */
export function BarChart({
  groups, h: ht = 220, yMax, money: isMoney, series, yLabel, xLabel, integer,
}: {
  groups: BarGroup[];
  h?: number;
  yMax?: number;
  money?: boolean;
  /** Name of each bar within a group, by position. */
  series?: string[];
  yLabel?: string;
  xLabel?: string;
  /** A count axis — no half gridlines. */
  integer?: boolean;
}) {
  const uid = useId();
  const w = 560;
  // Same reasoning as LineChart: a rotated axis title needs its own gutter,
  // and the tick labels already occupy the standard one.
  const pad = yLabel ? 56 : 40;
  const plotW = w - pad - 14;
  const plotH = ht - 34;
  const H = ht + (xLabel ? 15 : 0);
  // Constant depth for every bar — the whole honesty argument in two numbers.
  const DX = 4;
  const DY = 4;
  // A NEGATIVE VALUE IS DRAWN, NOT DISCARDED. An in-month movement can be
  // negative — a credit, a restated period — and this chart used to skip any
  // bar whose height was not positive while the call sites clamped the value
  // to zero first. Two different facts, "nothing happened" and "money came
  // back", drew as the same empty column. The axis now covers the range the
  // data actually occupy and bars hang below the zero line.
  const values = groups.flatMap((g) => g.bars.map((b) => (Number.isFinite(b.v) ? b.v : 0)));
  const peak = Math.max(0, ...values);
  const trough = Math.min(0, ...values);
  const scale = yMax != null && peak <= yMax && trough === 0
    ? { max: yMax, step: yMax / 4, count: 4, decimals: Number.isInteger(yMax / 4) ? 0 : 2 }
    : niceScale(peak, { integer });
  const below = trough < 0 ? niceScale(-trough, { integer }) : null;
  const lo = below ? -below.max : 0;
  const max = scale.max;
  const span = max - lo || 1;
  const gw = plotW / groups.length;
  const bw = Math.min(26, (gw - 14) / (groups[0]?.bars.length ?? 1));
  const Y = (v: number) => ht - 26 - ((v - lo) / span) * plotH;
  const zeroY = Y(0);
  // Gridlines run the whole range, at the same step on both sides of zero.
  const ticks = [
    ...(below ? Array.from({ length: below.count }, (_, i) => -(below.count - i) * below.step) : []),
    ...Array.from({ length: scale.count + 1 }, (_, i) => i * scale.step),
  ];

  // One gradient per distinct colour, shared by every bar that wears it.
  const colors = [...new Set(groups.flatMap((g) => g.bars.map((b) => b.color)))];
  const gradId = (c: string) => `${uid}bar${colors.indexOf(c)}`;
  const Ymid = (Y(0) + Y(max)) / 2;

  // The key's colour comes from the first group that actually carries a bar in
  // that position — a group whose first bar is zero is not drawn, and reading
  // the colour off groups[0] blindly would have coloured the key from a bar
  // the reader cannot see.
  const key = (series ?? [])
    .map((name, i) => {
      const color = groups.find((g) => g.bars[i])?.bars[i]?.color;
      return color ? { name, color, mark: 'block' as const } : null;
    })
    .filter((k): k is { name: string; color: string; mark: 'block' } => k !== null);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%">
        <defs>
          {colors.map((c) => (
            <linearGradient key={c} id={gradId(c)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={shade(c, 0.22)} />
              <stop offset="100%" stopColor={c} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((v, i) => (
          <g key={i}>
            <line
              x1={pad} x2={w - 14} y1={Y(v)} y2={Y(v)}
              stroke={v === 0 && below ? '#c9d2e0' : '#eef1f6'}
            />
            <text x={pad - 6} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="#9aa7bd">
              {isMoney ? mn(v) : v.toFixed(scale.decimals)}
            </text>
          </g>
        ))}
        {yLabel && (
          <text
            x={13} y={Ymid} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#6B7A90"
            transform={`rotate(-90 13 ${Ymid})`}
          >
            {yLabel}
          </text>
        )}
        {xLabel && (
          <text x={pad + plotW / 2} y={H - 3} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#6B7A90">
            {xLabel}
          </text>
        )}
        {groups.map((g, gi) => {
          const gx = pad + gi * gw + gw / 2;
          const tot = g.bars.length;
          const startX = gx - (tot * bw + (tot - 1) * 5) / 2;
          return (
            <g key={gi}>
              {g.bars.map((b, bi) => {
                const x = startX + bi * (bw + 5);
                // Measured from the ZERO LINE, so a negative bar hangs below
                // it at the same scale rather than vanishing.
                const v = Number.isFinite(b.v) ? b.v : 0;
                const bh = Math.abs(Y(v) - zeroY);
                const y = Math.min(Y(v), zeroY);
                if (bh < 0.5) return null;
                return (
                  <g key={bi}>
                    {/* Lit top face and shaded side face — the depth. */}
                    <polygon
                      points={`${x},${y} ${x + DX},${y - DY} ${x + DX + bw},${y - DY} ${x + bw},${y}`}
                      fill={shade(b.color, 0.42)}
                    />
                    <polygon
                      points={`${x + bw},${y} ${x + bw + DX},${y - DY} ${x + bw + DX},${y - DY + bh} ${x + bw},${y + bh}`}
                      fill={shade(b.color, -0.28)}
                    />
                    {/* The front face IS the datum: same baseline, same scale. */}
                    <rect x={x} y={y} width={bw} height={bh} fill={`url(#${gradId(b.color)})`} />
                  </g>
                );
              })}
              <text x={gx} y={ht - 8} textAnchor="middle" fontSize={9} fill="#9aa7bd">{g.label}</text>
            </g>
          );
        })}
      </svg>
      {key.length > 1 && <ChartLegend items={key} />}
    </div>
  );
}
