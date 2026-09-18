// ==========================================================================
// CHART LIGHTING — the one place a series colour becomes its lit faces.
//
// The dimensional styling on the chart primitives ("3D", as the owner asked)
// obeys one rule that keeps it honest: DEPTH IS CONSTANT AND PROJECTION IS
// PARALLEL. Every bar is extruded by the same offset, so no figure gains or
// loses apparent size from where it stands — which is exactly what a
// perspective 3D chart does, and why this codebase will never draw one. What
// moves is light, not geometry: a lit top face, a shaded side face, a sheen
// across a ring. The angles, lengths and areas that encode the data are the
// same ones the flat charts drew.
// ==========================================================================

/** #rrggbb or #rgb → [r, g, b]; anything else → null. */
function rgb(hex: string): [number, number, number] | null {
  const m6 = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m6) {
    const n = parseInt(m6[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m3 = /^#([0-9a-f]{3})$/i.exec(hex);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  return null;
}

/**
 * A colour mixed towards white (amt > 0) or black (amt < 0), −1..1.
 * A colour the parser does not recognise comes back unchanged rather than
 * black: a CSS variable or named colour should degrade to flat, not to a
 * hole in the chart.
 */
export function shade(hex: string, amt: number): string {
  const c = rgb(hex);
  if (!c) return hex;
  const t = amt > 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amt));
  const [r, g, b] = c.map((v) => Math.round(v + (t - v) * k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
