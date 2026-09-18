#!/usr/bin/env node
/**
 * Owner-developer domain guard.
 *
 * Tazayud is a real-estate developer/owner, not a contractor: every contract
 * value is a COST, never revenue. This makes the hard domain rule enforceable
 * instead of aspirational — the build fails if banned commercial language
 * reaches the source.
 *
 * Scoped to .ts/.tsx only. Two deliberate exclusions:
 *
 *   - CSS, because `margin:` is a layout property on nearly every rule and
 *     would drown the signal in false positives.
 *   - Comments, because documentation of the rule necessarily quotes the
 *     banned terms ("every contract value is a cost, never revenue"). The
 *     rule protects what reaches the user — identifiers and rendered strings —
 *     and a comment renders nowhere.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = [
  { re: /\bgross\s+profit\b/i, why: 'revenue-side term — Tazayud is the owner, not a contractor' },
  { re: /\bgross\s+margin\b/i, why: 'revenue-side term — contract values are costs' },
  { re: /\bprofit\s+margin\b/i, why: 'revenue-side term — contract values are costs' },
  { re: /\bcontractor\s+revenue\b/i, why: 'contractor payments are a cost to the owner' },
  { re: /\bbudget\s+headroom\b/i, why: 'use Budget Variance' },
  { re: /\brevenue\b/i, why: 'no revenue concept in owner-side cost control' },
  { re: /\blabou?r\s+rate/i, why: 'manpower tracks availability/utilisation only, never rates' },
];

const files = [];
const collectSourceFiles = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(file);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(file);
  }
};
collectSourceFiles('src');
const hits = [];

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlockComment = false;

  lines.forEach((line, i) => {
    const t = line.trim();

    if (inBlockComment) {
      if (t.includes('*/')) inBlockComment = false;
      return;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlockComment = true;
      return;
    }
    if (t.startsWith('//') || t.startsWith('*')) return;

    const code = line.split('//')[0];
    for (const { re, why } of BANNED) {
      if (re.test(code)) hits.push({ file, line: i + 1, text: t.slice(0, 100), why });
    }
  });
}

if (hits.length) {
  console.error('\nDOMAIN RULE VIOLATION — see README.md "Domain rules"\n');
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.why}\n    ${h.text}`);
  console.error(`\n${hits.length} violation(s).\n`);
  process.exit(1);
}

console.log(`domain rules  : clean (${files.length} source files scanned)`);
