// ==========================================================================
// HOW VITE_API_URL BECOMES A FETCH PREFIX
//
// Deliberately its own module with no imports, so the rule can be tested
// directly. It decides a single thing, and getting it wrong produces the
// least diagnosable failure this app has: a bare "Failed to fetch", with no
// status, because the browser never received a response to report.
//
// Two deployment shapes have to be expressible:
//
//   "/"                        the API is served from the same origin as the
//                              page. On Vercel that is the normal case — the
//                              SPA and api/[...path].ts are one project on one
//                              host — and it is the shape to prefer, because a
//                              same-origin request needs no preflight and
//                              carries the session's cookies as a matter of
//                              course.
//   "https://api.example.com"  the API is a separate host. Then CORS applies
//                              and ALLOWED_ORIGIN on the server has to name
//                              the site.
//
// Only the second used to be expressible: the empty string is what selects
// the offline build, so there was no value meaning "here", and an absolute
// URL was the only way to switch the app on. An absolute URL naming even a
// slightly different host than the one in the address bar — the branch
// deployment instead of production, the long team alias instead of the short
// one — quietly makes every call cross-origin. The preflight then has to be
// answered by something that speaks CORS, and Vercel's Deployment Protection
// challenge does not.
// ==========================================================================

/**
 * Turn the configured `VITE_API_URL` into the prefix `fetch` should use.
 *
 * `""` keeps meaning the self-contained build; that decision is made by the
 * caller, which checks the raw value. This only shapes a configured one.
 */
export function apiOriginFrom(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '' || value === '/') return '';
  // A trailing slash would otherwise produce "https://host//api/...".
  return value.replace(/\/+$/, '');
}
