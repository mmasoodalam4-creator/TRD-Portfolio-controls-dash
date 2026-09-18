#!/usr/bin/env node
/**
 * VITE_API_URL -> fetch prefix.
 *
 * This is four lines of string handling guarding the worst failure mode the
 * app has. Get it wrong and the browser reports "Failed to fetch" with no
 * status, because no response was ever delivered — there is nothing in the UI,
 * the server log or the network tab that names the cause.
 *
 * The case that matters most is same-origin. The app and the API are one
 * Vercel project on one host, so "/" has to resolve to no prefix at all. If it
 * does not, the only way to switch the app on is an absolute URL, and an
 * absolute URL naming a slightly different host than the address bar makes
 * every call cross-origin — which is how this fails in practice, since
 * Vercel's Deployment Protection challenge answers a preflight without CORS
 * headers.
 */
import { apiOriginFrom } from '../src/data/api-origin.ts';

const PATH = '/api/auth/login';

const CASES = [
  // raw                              expected prefix          resulting URL
  ['/', '', 'same origin — the shape to prefer on Vercel'],
  ['', '', 'unset: offline build (the caller, not this, selects the mock)'],
  [undefined, '', 'absent entirely'],
  ['   ', '', 'whitespace only'],
  ['  /  ', '', 'same origin, padded'],
  ['https://pmo.example.com', 'https://pmo.example.com', 'a separate API host'],
  ['https://pmo.example.com/', 'https://pmo.example.com', 'trailing slash trimmed'],
  ['https://pmo.example.com///', 'https://pmo.example.com', 'several trimmed'],
  ['  https://pmo.example.com  ', 'https://pmo.example.com', 'padded absolute'],
];

const failures = [];
let checks = 0;

for (const [raw, expected, note] of CASES) {
  checks++;
  const got = apiOriginFrom(raw);
  if (got !== expected) {
    failures.push(`${JSON.stringify(raw)} -> ${JSON.stringify(got)}, expected ${JSON.stringify(expected)} (${note})`);
  }
}

// The prefix is only ever concatenated with a path that already starts with a
// slash, so what actually matters is the URL that comes out.
const urls = [
  ['/', PATH],
  ['https://pmo.example.com/', 'https://pmo.example.com/api/auth/login'],
];
for (const [raw, expected] of urls) {
  checks++;
  const got = `${apiOriginFrom(raw)}${PATH}`;
  if (got !== expected) failures.push(`URL for ${JSON.stringify(raw)}: ${got}, expected ${expected}`);
  checks++;
  if (got.includes('//api/')) failures.push(`URL for ${JSON.stringify(raw)} has a doubled slash: ${got}`);
}

// ---------------------------------------------------------------------------
// Every call site must use the NORMALISED prefix.
//
// The rule above is worthless if a caller reaches past it. That is not a
// hypothetical: AuthProvider built `${apiUrl}/api/auth/login` from the raw
// value, so with VITE_API_URL="/" sign-in requested "//api/auth/login" — a
// protocol-relative URL the browser resolves as https://api/auth/login, a host
// that does not exist — while the repository, going through the rule, was
// fine. Fixing the rule alone would have left sign-in broken.
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const RAW_IN_URL = /\$\{\s*apiUrl\s*\}\s*\//;
for (const file of walk('src').filter((f) => /\.tsx?$/.test(f))) {
  if (file.endsWith(join('data', 'repository.ts'))) continue;  // where the rule lives
  checks++;
  const src = readFileSync(file, 'utf8');
  if (RAW_IN_URL.test(src)) {
    failures.push(`${file} builds a URL from the raw apiUrl — use apiOrigin, which is normalised`);
  }
}

console.log(`\nVITE_API_URL -> fetch prefix  ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  "/" means same origin; a separate host keeps its origin, without a doubled slash.\n');
process.exit(0);
