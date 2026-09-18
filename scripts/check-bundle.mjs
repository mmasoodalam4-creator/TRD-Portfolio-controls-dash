#!/usr/bin/env node
/**
 * The serverless function must bundle without the `@/` alias.
 *
 * This exists because of a trap with no local signal. The server shares
 * modules with the app — src/domain and src/data — and those app modules use
 * the `@/` path alias. Every one of those imports is currently `import type`,
 * so TypeScript erases them and no bundler ever has to resolve the alias.
 *
 * Add a single VALUE import through `@/` to any shared module and:
 *
 *   - `npm run dev`, `npm run build` and every existing gate still pass,
 *     because Vite resolves the alias
 *   - `tsx` still runs the API locally, because it reads tsconfig paths
 *   - and the serverless deployment fails, because the platform's bundler
 *     resolves from node_modules and the filesystem, not from tsconfig
 *
 * A defect that only appears in production, after a merge, is the worst kind
 * this project can ship. So the function is bundled here the hostile way —
 * with tsconfig deliberately blanked — and the build fails if anything in the
 * server's import graph needs the alias at runtime.
 */
import { build } from 'esbuild';

const ENTRY = 'api/[...path].ts';

try {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    // Blanked on purpose: this is the whole point of the check. The deployment
    // platform does not read our path aliases, so neither does this.
    tsconfigRaw: '{}',
    // Real dependencies are installed on the host and are not the subject here.
    external: ['pg', 'node:*'],
    logLevel: 'silent',
  });

  const bytes = result.outputFiles?.[0]?.contents.length ?? 0;
  console.log(`\nserverless bundle  ${ENTRY}\n`);
  console.log(`  bundles with no path-alias resolution — ${(bytes / 1024).toFixed(1)} kB\n`);
  process.exit(0);
} catch (err) {
  const errors = err?.errors ?? [];
  console.error(`\nserverless bundle  ${ENTRY}\n`);
  console.error('  FAILED — the function cannot be bundled without the @/ alias.\n');

  for (const e of errors) {
    const where = e.location ? `${e.location.file}:${e.location.line}` : 'unknown';
    console.error(`  ${where}  ${e.text}`);
  }

  console.error('\n  A module the server imports needs `@/` at runtime. The app builds fine'
    + '\n  and tsx runs fine, but the serverless deployment will not. Make that one'
    + '\n  import relative, or make it `import type` if it is only a type.\n');
  process.exit(1);
}
