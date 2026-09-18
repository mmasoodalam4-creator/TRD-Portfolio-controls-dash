// ==========================================================================
// THE BRAND MARKS, NAMED IN ONE PLACE
//
// Everything that shows a mark imports it from here — the sidebar and the
// sign-in card — so replacing the artwork is a change to this directory and
// nowhere else. The sign-in card used to draw its own shapes inline, which
// meant a new logo changed the sidebar and left the first screen anybody sees
// showing the old one.
//
// THREE FILES, and why there are three rather than one:
//
//   tazayud-lockup.svg   the official artwork exactly as supplied: the dotted
//                        blocks in #66B3C9 with the Arabic and Latin wordmarks
//                        in #0E223A. Used where the ground is light.
//   tazayud-blocks.svg   the same lockup cropped to the blocks alone, produced
//                        from it by scripts/brand-crop.mjs — the same path
//                        data, byte for byte, with a tightened viewBox. Used
//                        on the navy rail, where the wordmark half of the
//                        lockup would be very nearly invisible and where a
//                        collapsed sidebar has no room for it.
//   BMI-Final-Logo.png   the builder's mark, shown as a small credit.
//
// The crop exists so that nothing is ever REDRAWN or RECOLOURED. An
// application whose logo is a developer's approximation of a logo is a thing
// nobody notices until the day somebody puts it beside the real one.
//
// `assetsInlineLimit` inlines every one of these as a data URI, which keeps
// dist/index.html a single portable file — and makes the format free: the PNG
// travels exactly as the vectors do. Prefer SVG where it exists; it stays
// sharp at any size and costs fewer bytes.
//
// They are rendered with <img>, which makes each an ISOLATED document: it
// inherits neither the page's colours nor its fonts, so `currentColor` never
// reaches it. That is why the fills are literal, and why a light plate — not a
// CSS filter — is what puts the dark lockup on a dark ground.
// ==========================================================================

/** The full lockup: blocks, Arabic and Latin wordmarks. For light grounds. */
export { default as tazayudLockup } from './tazayud-lockup.svg';

/** The blocks alone, cropped from the lockup. For the navy rail. */
export { default as tazayudBlocks } from './tazayud-blocks.svg';

/** BMI+ Advisory, who built the system. A credit, never a co-brand. */
export { default as bmiMark } from './BMI-Final-Logo.png';

/** The blocks on a navy tile, for the browser tab. See `applyFavicon`. */
import tazayudFavicon from './tazayud-favicon.svg';

/**
 * Put the tab icon on the page.
 *
 * From here rather than from a `<link>` in index.html, because
 * vite-plugin-singlefile inlines scripts and stylesheets and does NOT inline a
 * link icon: it would be emitted as a sibling .svg referenced by path, and
 * dist/index.html is a file somebody double-clicks with no sibling beside it.
 * The one asset in the whole build would 404 — silently, leaving a blank icon
 * and a failed request in a deliverable that must make none.
 *
 * Imported, Vite inlines it as a data URI into the bundle that is already
 * inlined into the page. No second copy of the artwork and no second request.
 *
 * The element is REUSED if one already exists, so this cannot accumulate icons
 * across a hot reload.
 */
export function applyFavicon(): void {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const link = existing ?? document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = tazayudFavicon;
  if (!existing) document.head.appendChild(link);
}
