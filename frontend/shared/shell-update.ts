/**
 * The Android shell's half of update handling (ADR-0042).
 *
 * The shell is a remote-URL Capacitor app (ADR-0036), so the page it renders
 * updates the way the site does — but the native part only moves when a new APK
 * is installed, and nothing in the page can install one. `MainActivity` is
 * expected to publish its own state before the page loads:
 *
 * ```js
 * window.__royaraqamiaShell = { versionCode: 1234, updatePending: true };
 * ```
 *
 * `updatePending` is `true` only while the shell itself is behind a published
 * APK. It exists so there is never a pair of prompts: while a shell update is
 * pending, the shell's own prompt is the one that matters — it brings the web
 * build along with it — and the in-page prompt stays down.
 *
 * Absent (a browser, an older shell) reads as "no shell update pending", which
 * keeps the in-page prompt working everywhere else.
 */
declare global {
  interface Window {
    __royaraqamiaShell?: { versionCode?: number; updatePending?: boolean };
  }
}

export function isShellUpdatePending(): boolean {
  if (typeof window === 'undefined') return false;
  return window.__royaraqamiaShell?.updatePending === true;
}
