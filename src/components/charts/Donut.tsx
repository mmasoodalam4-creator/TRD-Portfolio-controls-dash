import { useId } from 'react';
import { mn } from '@/domain/format';

export interface DonutSlice {
  name: string;
  v: number;
  c: string;
  label?: string;
}

/**
 * The dimensional finish shared by both donut variants: a soft ambient
 * shadow under the ring and a sheen across its upper edge. The sheen is one
 * uniform overlay on every slice, so no category is lit brighter than
 * another — the angles that encode the data are untouched. The shadow blurs
 * evenly (no offset) because the svg is rotated −90°, and a directional
 * offset would rotate with it.
 *
 * Adjacent slices are separated by a 2.5px surface gap — only when there is
 * more than one visible slice; a lone slice keeps its full arc.
 */
function RingDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}sheen`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#0B2545" stopOpacity="0.10" />
        <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.34" />
      </linearGradient>
      <filter id={`${uid}lift`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="2.6" floodColor="#0B2545" floodOpacity="0.22" />
      </filter>
    </defs>
  );
}

function ringSlices(
  data: DonutSlice[], cx: number, cy: number, r: number, width: number, uid: string,
) {
  const C = 2 * Math.PI * r;
  const sum = data.reduce((a, d) => a + d.v, 0);
  const gap = data.filter((d) => d.v > 0).length > 1 ? 2.5 : 0;
  let off = 0;
  return (
    <>
      <g filter={`url(#${uid}lift)`}>
        {data.map((d, i) => {
          // A register whose slices sum to zero used to emit
          // strokeDasharray="NaN NaN" on every segment. Zero of nothing is
          // no segment; the grey track already reads as empty.
          const len = sum ? C * (d.v / sum) : 0;
          const el = (
            <circle
              key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.c} strokeWidth={width}
              strokeDasharray={`${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}`}
              strokeDashoffset={-off} strokeLinecap="butt"
            />
          );
          off += len;
          return el;
        })}
      </g>
      {/* The sheen — one overlay, every slice lit the same. */}
      {sum > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={`url(#${uid}sheen)`} strokeWidth={width} pointerEvents="none" />
      )}
    </>
  );
}

/**
 * Hand-built SVG donut with a legend beside it. The demo carries no charting
 * library on purpose — these five primitives cover every screen and keep the
 * single-file deliverable small.
 *
 * THE LEGEND SITS BESIDE THE RING, NEVER ON IT.
 *
 * There used to be a spacer between them carrying `marginLeft: -size + 22`,
 * which pulled the legend back across the ring by the whole width of the chart
 * less 22px — so on Cost by Category the ring was drawn straight through
 * "Approved Budget" and the first two legend rows. A negative margin sized from
 * a prop is not a layout; it is an offset that happens to look right at one
 * width and is wrong at every other.
 *
 * A two-track grid instead: the ring takes exactly its own size, the legend
 * takes the rest, and `minmax(0, 1fr)` lets the legend's rows shrink rather
 * than push out of the card.
 */
export function Donut({ data, total, label, size = 150 }: {
  data: DonutSlice[];
  total?: string;
  label?: string;
  size?: number;
}) {
  const uid = useId();
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${size}px minmax(0, 1fr)`,
      gap: 22,
      alignItems: 'center',
    }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <RingDefs uid={uid} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f6" strokeWidth={13} />
        {ringSlices(data, cx, cy, r, 13, uid)}
      </svg>
      <div className="donut-legend">
        {label ? (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{total}</div>
            <div className="muted" style={{ fontSize: 11 }}>{label}</div>
          </div>
        ) : null}
        {data.map((d, i) => (
          <div className="dl-row" key={i} style={{ gap: 14 }}>
            {/* minWidth 0 so a long category name wraps inside the legend
                rather than pushing the figure out of the card. */}
            <div className="row" style={{ gap: 7, minWidth: 0, overflowWrap: 'anywhere' }}>
              <span className="dot" style={{ background: d.c, flex: '0 0 auto' }} />{d.name}
            </div>
            <b style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {d.label ?? mn(d.v)}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Donut variant with the headline figure inside the ring.
 *
 * IT CARRIES ITS KEY UNDERNEATH, because a ring of coloured arcs with a
 * number in the middle says how many there are and nothing at all about what
 * the colours mean. Risk by Category shipped exactly like that: five arcs,
 * five categories, and no way to tell which arc was Commercial.
 *
 * `keyBelow` turns it off for the one caller that draws a RICHER key beside
 * the ring — the Dashboard, whose rows carry each portfolio's signed variance
 * in red or black. That is a legend with figures in it, not a missing one, and
 * the narrow card underneath the ring could not hold the extra column.
 */
export function DonutCenter({ data, center, sub, size = 170, keyBelow = true, fmtV }: {
  data: DonutSlice[];
  center: string;
  sub: string;
  size?: number;
  keyBelow?: boolean;
  fmtV?: (d: DonutSlice) => string;
}) {
  const uid = useId();
  const r = size / 2 - 16;
  const cx = size / 2;
  const cy = size / 2;

  const ring = (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <RingDefs uid={uid} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f6" strokeWidth={15} />
        {ringSlices(data, cx, cy, r, 15, uid)}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{center}</div>
        <div className="muted" style={{ fontSize: 10.5 }}>{sub}</div>
      </div>
    </div>
  );

  if (!keyBelow || data.length < 2) return ring;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {ring}
      <div className="donut-legend" style={{ gap: 7, width: '100%' }}>
        {data.map((d, i) => (
          <div className="dl-row" key={i} style={{ gap: 14, fontSize: 11.5 }}>
            <div className="row" style={{ gap: 7, minWidth: 0, overflowWrap: 'anywhere' }}>
              <span className="dot" style={{ background: d.c, flex: '0 0 auto' }} />{d.name}
            </div>
            <b style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {fmtV ? fmtV(d) : (d.label ?? String(d.v))}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}
