import { reportToShell, runSyncFlushPage } from '@/frontend/api/sync-flush-entry';

/**
 * The drain the Android shell's WorkManager job loads (ADR-0059), compiled to
 * `public/sync-flush.js` by `scripts/build-sync-flush.mjs` and loaded by
 * `public/sync-flush.html`.
 *
 * It is a *page* rather than a service-worker handler because the shell's headless
 * WebView can only run a document, and it is the shell's own page rather than an
 * app route because the app's root layout would pull React, the session provider
 * and the whole chrome into a WebView nobody looks at. The report is what ends
 * the worker's wait, so it is sent on every path — including the ones where the
 * drain could not run at all.
 */
async function main(): Promise<void> {
  const report = await runSyncFlushPage();
  const line = `[sync-flush] ${JSON.stringify(report)}`;

  // Read from `adb logcat` when a device misbehaves; the worker has its own copy.
  console.log(line);
  if (reportToShell(report)) return;

  const status = document.getElementById('sync-flush-status');
  if (status) status.textContent = line;
}

void main();
