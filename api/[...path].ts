// Serverless entry point.
//
// Vercel treats every file under api/ as a function, and this catch-all takes
// the whole /api/* surface. It delegates to exactly the same handler the
// self-hosted server uses, so the two deployments cannot behave differently —
// which is what keeps the host, like the database, a deployment decision.
//
// The rewrite in vercel.json deliberately excludes /api/ so these requests
// reach here rather than being swallowed by the single-page fallback.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from '../server/handler.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  handle(req, res);
}
