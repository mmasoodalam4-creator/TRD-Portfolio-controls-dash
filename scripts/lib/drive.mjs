// Shared browser driving helpers used by verify.mjs and visual-diff.mjs.
// Both scripts must exercise the app the same way for their results to be
// comparable, so the interaction vocabulary lives here once.

// EVERY sidebar module. verify.mjs asserts this list is a subset of what the
// sidebar renders, so a module missing from here is protected by nothing but
// the bare count — which survives any one-for-one swap. Project Workspace and
// Review & Approve were absent for exactly as long as they were the newest.
export const NAV_LABELS = [
  'Dashboard', 'Projects', 'Project Workspace', 'Review & Approve', 'Authorisations',
  'WBS', 'Cost & Financials', 'Variations', 'Change Log',
  'Packages & Contracts', 'Payment Claims', 'Evaluation', 'Manpower', 'Equipment', 'Quality', 'HSE', 'Risk', 'Issues',
  'Reports', 'Analytics', 'Documents', 'Glossary', 'Administration',
];

export async function gotoApp(page, fileUrl) {
  await page.goto(fileUrl);
  await page.waitForSelector('.nav-item', { timeout: 15_000 });
  await page.waitForTimeout(400);
}

export async function navigate(page, label) {
  await page.evaluate((l) => {
    const item = [...document.querySelectorAll('.nav-item')]
      .find((x) => x.textContent.trim() === l);
    if (!item) throw new Error('no nav item: ' + l);
    item.click();
  }, label);
  await page.waitForTimeout(220);
}

export function clickButton(page, text) {
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => x.textContent.trim().includes(t));
    if (!b) throw new Error('no button: ' + t);
    b.click();
  }, text);
}

/**
 * Open the reconciliation engine.
 *
 * Matched by pattern, not by the literal "10/10". The badge reports the live
 * pass count, so a literal made the harness die with "no button: 10/10" at
 * exactly the moment a control started failing — masking the finding behind a
 * drive error instead of reporting it.
 */
export async function openIntegrity(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.topbar-right button')]
      .find((x) => /^\d+\s*\/\s*\d+$/.test(x.textContent.trim()));
    if (!b) throw new Error('integrity badge not found in the topbar');
    b.click();
  });
  await page.waitForSelector('.big-status', { timeout: 5000 });
}

/** Freeze animation so screenshots are deterministic. */
export async function stillFrame(page) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  });
  await page.waitForTimeout(120);
}
