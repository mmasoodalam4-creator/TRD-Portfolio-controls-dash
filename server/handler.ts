// The request handler, independent of how it is hosted.
//
// Two hosts use it, and neither is allowed to know anything the other does
// not: server/server.ts runs it under node:http for self-hosting, and
// api/[...path].ts runs it as a serverless function. Splitting it out is what
// stops the two drifting into different behaviour — and what keeps the choice
// of host, like the choice of database, a deployment decision.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PayloadTooLarge, route } from './routes.js';
import { bearer, Hs256Verifier, type TokenVerifier } from './auth.js';

const verifier: TokenVerifier = new Hs256Verifier(process.env.AUTH_SECRET ?? '');

/** Browsers calling from the app origin. Tightened by ALLOWED_ORIGIN in production. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

/**
 * The request path the routes should dispatch on.
 *
 * `req.url` is the whole story under node:http, and not under a rewrite. A
 * rewritten request arrives carrying the DESTINATION path, with the segments
 * the catch-all captured handed over as repeated `path` query parameters —
 * `/api/[...path]?path=auth&path=login` rather than `/api/auth/login`. Routes
 * that compare against `/api/auth/login` then match nothing, and every nested
 * route 404s while the single-segment ones look fine.
 *
 * So rebuild the path from those segments whenever `req.url` does not already
 * carry a usable one. Both hosts then dispatch on the same string, which is the
 * point of there being one handler.
 */
function requestPath(url: URL): string {
  const segments = url.searchParams.getAll('path').filter(Boolean);
  if (segments.length && !url.pathname.startsWith('/api/')) {
    return `/api/${segments.join('/')}`;
  }
  // A catch-all destination that kept its own placeholder in the path.
  if (url.pathname.includes('[') && segments.length) {
    return `/api/${segments.join('/')}`;
  }
  return url.pathname;
}

export function handle(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  // DELETE is /api/users/:id. Same-origin it works without a preflight, so
  // its absence here only surfaced on the split-origin deployment ALLOWED_ORIGIN
  // exists for — where the browser refused account removal with no server trace.
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  // Everything synchronous is inside the try. The URL used to be parsed
  // against `http://${host}`, and a Host header Node's parser accepts but the
  // URL parser does not — one containing a space — threw here, outside the
  // promise chain and its catch, as an uncaught exception in the 'request'
  // listener. On node:http that ends the process; an unauthenticated request
  // could take the self-hosted server down. The origin was never used for
  // anything but rebuilding the path, so it is now a constant.
  let url: URL;
  let who: ReturnType<TokenVerifier['verify']>;
  try {
    const raw = new URL(req.url ?? '/', 'http://localhost');
    url = new URL(requestPath(raw) + raw.search, 'http://localhost');
    const token = bearer(req.headers.authorization);
    who = token ? verifier.verify(token) : null;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'malformed request' }));
    return;
  }

  route(req, url, who)
    .then(({ status, body }) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    })
    .catch((err: unknown) => {
      // A body over the ceiling is the client's problem and says so.
      if (err instanceof PayloadTooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'the request body is too large' }));
        return;
      }
      // A request that could not get a database connection within the pool's
      // deadline. Named rather than folded into "internal error", because the
      // two want different actions: this one is the deployment being out of
      // connections for a moment, and trying again is the right advice. It
      // says nothing about the database beyond that it was busy.
      if (err instanceof Error && /timeout exceeded when trying to connect/i.test(err.message)) {
        console.error('[api] no database connection available', url.pathname);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The system is busy and could not reach the database. Try again in a moment.',
        }));
        return;
      }
      // Logged, not returned: an internal failure should not describe the
      // internals to whoever provoked it.
      console.error('[api]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal error' }));
    });
}

export { signer } from './routes.js';
