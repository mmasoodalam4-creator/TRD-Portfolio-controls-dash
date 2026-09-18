/**
 * THE KEY TO A CHART, DRAWN BY THE CHART.
 *
 * `LineSeries` has carried a `name` since the first chart was written and
 * nothing ever rendered it. Four screens noticed the hole and filled it by
 * hand — Dashboard twice, Overview, Analytics, Cash Flow, Monthly Cost — each
 * with its own row of dots, its own gap (18, 16, 14), its own font size (11.5,
 * 11) and its own names for the same three series ('PV' on one screen,
 * 'Planned Value (PV)' on another). Seven charts had no key at all: a reader
 * looking at First Time Right saw a red line and a blue line and nothing on
 * the page said which was which.
 *
 * So the key is not something a screen remembers to add. It is drawn by
 * `LineChart`, `BarChart` and `DonutCenter` from the series they were handed,
 * which means a chart cannot be put on a screen without one.
 *
 * TWO RULES, BOTH FROM THE SAME PLACE — identity must never be colour alone:
 *
 * - **The swatch is the mark.** A line series gets a line, dashed exactly as
 *   the series is dashed, so the planned-value curve is identifiable in the
 *   key by its dashes and not only by its blue. A bar or a slice gets a block.
 *   A dot for everything would have made the dashed series indistinguishable
 *   from the solid one for a reader who cannot separate the hues.
 * - **The text is text.** Names are set in the page's ink, never in the
 *   series colour: coloured text on a white card is the pair most likely to
 *   fail contrast, and the swatch beside it already carries the identity.
 *
 * ONE SERIES GETS NO KEY. The card's own heading names it, and a legend
 * repeating the title under a single line is furniture. The charts apply that
 * themselves — see the `series.length > 1` test at each call.
 */
export interface LegendItem {
  name: string;
  color: string;
  /** The series' own dash pattern, so the key is dashed where the line is. */
  dash?: string;
  /** How the series is drawn: a line, or a filled bar / slice. */
  mark?: 'line' | 'block';
}

function Swatch({ color, dash, mark }: LegendItem) {
  return (
    <svg width={16} height={10} aria-hidden="true">
      {mark === 'block'
        ? <rect x={2} y={1} width={12} height={8} rx={2} fill={color} />
        : (
          <line
            x1={1} y1={5} x2={15} y2={5}
            stroke={color} strokeWidth={2.5} strokeLinecap="round"
            strokeDasharray={dash ?? '0'}
          />
        )}
    </svg>
  );
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="chart-legend">
      {items.map((it, i) => (
        <span className="cl-item" key={i}>
          <Swatch {...it} />
          <span>{it.name}</span>
        </span>
      ))}
    </div>
  );
}
