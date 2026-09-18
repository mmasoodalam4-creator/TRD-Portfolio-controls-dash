/**
 * Progress bar with its percentage. Colour derives from the value unless
 * overridden.
 *
 * A value beyond 100 fills the track RED, never green: a package drawn down
 * beyond its commitment used to paint the same full green-to-gold bar as one
 * settled exactly, with only the number beside it to say otherwise — and
 * over-payment against a commitment is the defect control 18 exists to find,
 * not a completion. Negative clamps to an empty track.
 */
export function Prog({ v, color }: { v: number; color?: string }) {
  const over = v > 100;
  const shown = Math.max(0, Math.min(100, v));
  const c = over ? 'var(--red)'
    : color ?? (v >= 80 ? 'var(--green)' : v >= 50 ? 'var(--gold)' : 'var(--amber)');
  return (
    <div className="row" style={{ gap: 8 }}>
      {/* backgroundColor, not the background shorthand: the gloss the track's
          CSS layers over the fill is a background-image, and the shorthand
          would reset it. */}
      <div className="prog"><span style={{ width: `${shown}%`, backgroundColor: c }} /></div>
      {/* one text node, not {v} + '%': adjacent JSX text nodes shape
          separately and shift the glyphs by a subpixel. */}
      <span style={{ fontSize: 11, fontWeight: 600, minWidth: 32, color: over ? 'var(--red)' : undefined }}>{`${v}%`}</span>
    </div>
  );
}
