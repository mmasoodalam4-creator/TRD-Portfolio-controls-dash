#!/usr/bin/env node
/**
 * The serverless function must LOAD under Node's ESM resolver, unbundled.
 *
 * This exists because check-bundle.mjs proved the wrong thing. It bundles the
 * function, and a bundler resolves `from '../server/handler'` by looking at the
 * filesystem — so it passed, and the deployment still died on the first
 * request:
 *
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/handler'
 *   imported from /var/task/api/[...path].js
 *
 * That path is the whole lesson. Vercel TRANSPILED the TypeScript to .js and
 * did NOT bundle it, so plain Node ESM resolution applied — and Node ESM
 * requires the extension on a relative import. package.json says
 * "type": "module", so every relative specifier in the function's import graph
 * has to end in .js, pointing at the file that will exist after transpilation.
 *
 * Nothing local caught it: Vite resolves extensionless imports, tsx resolves
 * them, esbuild resolves them, and TypeScript is configured with
 * moduleResolution "bundler", which is documented to allow them. Five tools
 * agreeing, and all five wrong about the one environment that matters.
 *
 * So this reproduces that environment rather than approximating it: every
 * module in the function's graph is transpiled to .js with its import
 * specifiers untouched, laid out exactly as /var/task is, and the entry point
 * is then imported by Node itself and invoked. If a specifier will not resolve
 * in production, it does not resolve here either.
 */
import { build } from 'esbuild';
import { rmSync, mkdirSync, readdirSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { join, resolve } from 'node:path';

const ENTRY = 'api/[...path].ts';
// Inside the project so node_modules still resolves, and already gitignored.
const OUT = 'tests/output/serverless-esm';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sources = [];
const collectTypeScript = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) collectTypeScript(file);
    else if (entry.isFile() && entry.name.endsWith('.ts')) sources.push(file);
  }
};
for (const dir of ['api', 'server', 'src/domain', 'src/data']) {
  collectTypeScript(dir);
}

// bundle:false is the point — specifiers are emitted exactly as written, which
// is what Vercel ships and what Node then has to resolve on its own.
await build({
  entryPoints: sources,
  bundle: false,
  outdir: OUT,
  outbase: '.',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'silent',
});

// The function refuses to start without a signing secret, and that is right —
// an empty secret means forgeable tokens, so failing at load is better than
// serving. It does mean an unset AUTH_SECRET produces this same
// FUNCTION_INVOCATION_FAILED, which is worth knowing when reading a crash.
// Resolution is what is under test here, so give it one.
process.env.AUTH_SECRET ??= 'check-serverless-esm-secret';

const failures = [];
let checks = 0;

const entryJs = resolve(OUT, ENTRY.replace(/\.ts$/, '.js'));
let mod = null;
checks++;
try {
  mod = await import(`file://${entryJs}`);
} catch (err) {
  failures.push(
    `the function does not load under Node ESM: ${err.code ?? err.name} — ${String(err.message).split('\n')[0]}`
    + '\n        every relative import in the graph must end in .js, because'
    + '\n        package.json is "type": "module" and Vercel does not bundle.',
  );
}

if (mod) {
  checks++;
  if (typeof mod.default !== 'function') failures.push('the module loaded but exports no default handler');

  // Loading is most of it, but a handler that throws on the simplest possible
  // request is the same outage. /api/health touches no database.
  checks++;
  const req = Object.assign(new EventEmitter(), {
    url: '/api/health', method: 'GET', headers: { host: 'check.local' },
  });
  const seen = {};
  const res = {
    setHeader() {},
    writeHead(status) { seen.status = status; return this; },
    end(body) { seen.body = String(body ?? ''); },
  };
  try {
    mod.default(req, res);
    await new Promise((r) => { setTimeout(r, 500); });
    if (seen.status !== 200 || !seen.body.includes('"ok":true')) {
      failures.push(`/api/health answered ${seen.status ?? 'nothing'}: ${seen.body ?? ''}`);
    }
  } catch (err) {
    failures.push(`/api/health threw: ${String(err?.message).split('\n')[0]}`);
  }
}

// ---------------------------------------------------------------------------
// A POST whose body the host already read.
//
// Vercel's Node runtime parses the request body before the handler runs and
// exposes it as req.body, having consumed the stream to do so. A handler that
// reads the stream itself then waits for an 'end' that has already fired and
// hangs until the platform kills the invocation — which reaches the browser as
// an HTML error page, not an API response.
//
// Every existing gate drives the node:http server, where nothing has touched
// the request, so all of them missed this. The shape below is the one Vercel
// actually delivers: a request whose stream is spent and whose body is already
// an object.
// ---------------------------------------------------------------------------
if (mod) {
  checks++;
  const req = Object.assign(new EventEmitter(), {
    url: '/api/auth/login',
    method: 'POST',
    headers: { host: 'check.local', 'content-type': 'application/json' },
    body: { email: 'nobody@check.local', password: 'not-a-real-password' },
    readableEnded: true,
    // An already-consumed stream: iterating it produces nothing, for ever.
    [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
  });
  const seen = {};
  const res = {
    setHeader() {},
    writeHead(status) { seen.status = status; return this; },
    end(body) { seen.body = String(body ?? ''); },
  };

  mod.default(req, res);
  await Promise.race([
    (async () => { while (seen.status === undefined) await new Promise((r) => { setTimeout(r, 25); }); })(),
    new Promise((r) => { setTimeout(r, 4000); }),
  ]);

  if (seen.status === undefined) {
    failures.push(
      'POST /api/auth/login never answered when the host had already read the body'
      + '\n        — the handler is waiting on a stream that is already spent, which on'
      + '\n        Vercel means the invocation hangs until it is killed.',
    );
  } else if (!seen.body.startsWith('{')) {
    failures.push(`POST /api/auth/login answered ${seen.status} with a non-JSON body: ${seen.body.slice(0, 80)}`);
  }
}

// ---------------------------------------------------------------------------
// A request that arrived through a rewrite.
//
// /api/nope reached the function and answered; /api/auth/login returned
// Vercel's own 404. One segment routed, two did not — so the catch-all is
// reached by an explicit rewrite now, and a rewritten request does not carry
// the path the client asked for. It carries the DESTINATION, with the captured
// segments as repeated `path` query parameters.
//
// Routes comparing against '/api/auth/login' match nothing in that shape, and
// every nested route 404s while the single-segment ones keep working — which
// is what the deployment did.
// --------------------------------------------------------------------------
if (mod) {
  // The probe has to be a route handled BEFORE the authentication gate.
  // Every else answers 401 whether the path matched or not, so an
  // unmatched path is indistinguishable from an unauthenticated one — which is
   // why the first version of this check passed on the very defect it was
   // written for. /api/health is public, so only a router that actually saw
  // "/api/health" can answer it.
  for (const [label, rawUrl] of [
    ['direct', '/api/health'],
    ['rewritten', '/api/[...path]?path=health'],
    ['rewritten, nested', '/api/[...path]?path=auth&path=login'],
  ]) {
    checks++;
    const nested = rawUrl.includes('path=auth');
    const req = Object.assign(new EventEmitter(), {
      url: rawUrl,
      method: nested ? 'POST' : 'GET',
      headers: { host: 'check.local', 'content-type': 'application/json' },
      // Deliberately invalid before any database lookup: this is a routing
      // probe, and the ESM gate must remain runnable without PostgreSQL.
      ...(nested ? { body: {} } : {}),
      readableEnded: true,
    });
    const seen = {};
    const res = {
      setHeader() {},
      writeHead(status) { seen.status = status; return this; },
      end(body) { seen.body = String(body ?? ''); },
    };
    mod.default(req, res);
    await new Promise((r) => { setTimeout(r, 300); });

    // Unauthenticated, so the right answer is the API's own 401. What must NOT
    // happen is 'no such route': that is the router being handed
    // '/api/[...path]' and matching nothing, which is the deployed failure.
    // Asserting merely that JSON came back would pass on it, since that 404 is
    // JSON too.
    // /api/health answers 200 {"ok":true}; the login route rejects the empty
    // payload before it reaches the database. Either proves the router saw a real path. A generic
    // "authentication required", or "no such route", means it saw the rewrite
    // destination instead and matched nothing — the deployed failure.
    const matched = nested
      ? seen.body?.includes('email and password are required')
      : seen.body?.includes('"ok":true');
    if (!matched) {
      failures.push(
        `${label} (${rawUrl}) reached the function but matched no route: ${seen.status} ${seen.body ?? ''}`
        + '\n        — the path came from the rewrite destination rather than the segments'
        + '\n        it captured, so nested routes 404 while single-segment ones look fine.',
      );
    }
  }
}

console.log(`\nserverless ESM  ${ENTRY} unbundled, as Vercel runs it  —  ${checks} checks\n`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n  ${failures.length} failure(s).\n`);
  process.exit(1);
}
console.log('  loads under Node\'s own resolver and answers /api/health.\n');
process.exit(0);
