import { shade } from './fx';

export interface HBarItem {
  label: string;
  v: number;
  color: string;
}

/**
 * Horizontal bars — performance indices and similar bounded comparisons.
 *
 * THE LABEL COLUMN SIZES ITSELF, AND THAT IS THE WHOLE POINT.
 *
 * It used to be a fixed 52px box. Every label longer than about eight
 * characters was then clipped or wrapped underneath its own bar — on
 * Commitment by Category ("Architectural", "Consultancy", "Temporary Works"),
 * on Manpower's trades, and anywhere else this is used with real names. It had
 * been "fixed" once at the wrong layer, by truncating the TEXT to eighteen
 * characters, which does nothing about a box that is 52px wide.
 *
 * A three-track grid fixes it properly: the label track takes the width of the
 * longest label, so every bar still starts at the same x — which is what makes
 * the bars comparable — and no label is ever cut. `minmax(0, max-content)` lets
 * that track shrink and the label wrap when the card is narrow, and the bar
 * track keeps a floor so it never collapses to nothing.
 */
export function HBars({ items, max, fmtV }: {
  items: HBarItem[];
  max?: number;
  fmtV?: (v: number) => string;
}) {
  // All-zero rows used to give mx = 0 and every width "NaN%" — an invalid
  // declaration the bar silently ignored. Zero of zero is an empty bar.
  //
  // THE SCALE NEVER CLIPS. `max` is the reference a caller states — 100 for a
  // percentage, 1.25 for an index — and it used to be a CEILING: the width was
  // clamped, so a package paid 112% of its commitment drew exactly as long as
  // one paid 100%, and a development at SPI 1.40 exactly as long as one at
  // 1.25. The bar is the datum, so two facts drawing one length is the chart
  // asserting they are equal. Past the reference the scale grows to hold the
  // data, and the figure beside the bar says which is which.
  const peak = Math.max(...items.map((i) => i.v), 0);
  const mx = Math.max(max ?? 0, peak);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, max-content) minmax(70px, 1fr) max-content',
        alignItems: 'center',
        columnGap: 10,
        rowGap: 9,
      }}
    >
      {items.map((it, i) => (
        // A fragment per row rather than a wrapper: the three cells have to be
        // direct children of the grid for the label track to be shared, which
        // is what aligns every bar to the same left edge.
        <div key={i} style={{ display: 'contents' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{it.label}</div>
          {/* A recessed track and a lit bar: the width is the datum, exactly
              as before — the depth is light, not geometry. */}
          <div style={{
            height: 13, background: '#e9edf3', borderRadius: 7, overflow: 'hidden',
            boxShadow: 'inset 0 1px 2px rgba(16,27,45,.10)',
          }}>
            <div style={{
              width: `${mx ? Math.max(0, (it.v / mx) * 100) : 0}%`,
              height: '100%', borderRadius: 7,
              background: `linear-gradient(180deg, ${shade(it.color, 0.30)} 0%, ${it.color} 55%, ${shade(it.color, -0.14)} 100%)`,
              boxShadow: '0 1px 2px rgba(16,27,45,.18)',
            }} />
          </div>
          <div style={{
            fontSize: 11, textAlign: 'right', fontWeight: 600,
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>
            {fmtV ? fmtV(it.v) : it.v}
          </div>
        </div>
      ))}
    </div>
  );
}
