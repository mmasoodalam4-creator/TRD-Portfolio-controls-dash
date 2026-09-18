// Self-hosted entry point: the API under node:http.
//
// Used for local development, for the gates, and for any deployment that runs
// a long-lived process. The serverless deployment uses the same handler
// through api/[...path].ts — see server/handler.ts.
import { createServer } from 'node:http';
import { handle } from './handler.js';
import { pool } from './db.js';

const PORT = Number(process.env.PORT ?? 4000);

export const server = createServer(handle);

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`[api] listening on ${PORT}`));
}

export async function close(): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  await pool.end();
}
