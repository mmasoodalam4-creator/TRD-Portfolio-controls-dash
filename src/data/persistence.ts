// Mutation log persistence.
//
// The log lives in the browser so the demo remembers what was done to it across
// reloads without needing a backend. Every access is wrapped: a file:// page, a
// private window, or a browser with site data blocked all throw on
// localStorage, and the demo must still open in those.
//
// This is deliberately the only storage concern in the app. When a backend
// arrives, the repository posts the same mutations instead of writing here.
import type { Mutation } from './mutations.js';

const KEY = 'tazayud-pmo:mutations:v1';

export function loadMutations(): Mutation[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Mutation[]) : [];
  } catch {
    // Storage unavailable or corrupt. The demo runs from the fixtures.
    return [];
  }
}

export function saveMutations(log: Mutation[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(log));
  } catch {
    // Nothing to do: the session keeps its in-memory state, it just will not
    // survive a reload. Never let this break the page.
  }
}

export function clearMutations(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // As above.
  }
}
