#!/usr/bin/env node
/**
 * Re-freeze the visual reference after an intended visual change.
 *
 *   node scripts/freeze-baseline.mjs
 *
 * Two baselines, deliberately:
 *
 *   tests/baseline/legacy.html   the pre-migration demo. Immutable. It is the
 *                                record that the Vite port changed nothing,
 *                                and is never regenerated.
 *   tests/baseline/current.html  the expected appearance of the app right now.
 *                                Re-frozen only in a commit that intends a
 *                                visual change, and the commit says what moved.
 *
 * Everyday diffs run against current.html, so an unintended change still fails
 * at 0.000% tolerance even in a phase that deliberately alters the design.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve(process.argv[2] ?? 'dist/index.html');
const dest = resolve('tests/baseline/current.html');
if (!existsSync(src)) { console.error('build first: ' + src); process.exit(1); }
copyFileSync(src, dest);
console.log(`baseline re-frozen: ${dest}\n  from: ${src}\n\nThe commit that does this must say which pixels moved and why.`);
