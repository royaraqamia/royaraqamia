import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Android shell's drain page is three hand-maintained pieces and one line of
 * Java that names it (`ShellServer.FLUSH_PATH`), and nothing at build time links
 * them: a renamed bundle or a moved page would leave the shell waking to load a
 * document that 404s, which reads from the worker's side as "come back later"
 * forever. So the agreement is pinned here, outside the JVM and outside the
 * device.
 */

const html = readFileSync('public/sync-flush.html', 'utf8');
const builder = readFileSync('scripts/build-sync-flush.mjs', 'utf8');
const entry = readFileSync('frontend/api/sync-flush-entry.ts', 'utf8');
const bridge = readFileSync(
  'android/app/src/main/java/com/royaraqamia/app/ShellSyncBridge.java',
  'utf8'
);
const server = readFileSync(
  'android/app/src/main/java/com/royaraqamia/app/ShellServer.java',
  'utf8'
);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const wake = readFileSync(
  'android/app/src/main/java/com/royaraqamia/app/ShellSyncWake.java',
  'utf8'
);
const messagingService = readFileSync(
  'android/app/src/main/java/com/royaraqamia/app/SyncMessagingService.java',
  'utf8'
);
const fcmClient = readFileSync('backend/services/push/fcm-client.ts', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

describe('the shell drain page', () => {
  it('loads the bundle the build script writes', () => {
    expect(html).toContain('src="/sync-flush.js"');
    expect(builder).toContain("const OUTPUT = 'public/sync-flush.js'");
    expect(builder).toContain("const ENTRY = 'frontend/api/sync-flush.ts'");
  });

  it('reports into the element the bootstrap names', () => {
    expect(html).toContain('id="sync-flush-status"');
    expect(readFileSync('frontend/api/sync-flush.ts', 'utf8')).toContain(
      "getElementById('sync-flush-status')"
    );
  });

  it('is built on every predev and prebuild, so it cannot ship stale', () => {
    expect(packageJson.scripts.predev).toContain('scripts/build-sync-flush.mjs');
    expect(packageJson.scripts.prebuild).toContain('scripts/build-sync-flush.mjs');
  });

  it('is not indexed, and is not a route with app chrome', () => {
    expect(html).toContain('name="robots" content="noindex"');
    // The whole reason it lives in `public/`: no React, no session provider.
    expect(existsSync('app/sync-flush')).toBe(false);
  });

  it('uses the path the shell loads', () => {
    const path = server.match(/FLUSH_PATH = "([^"]+)"/)?.[1];
    expect(path).toBeTruthy();
    expect(existsSync(`public${path}`)).toBe(true);
  });

  it('uses the bridge name the shell injects, on both sides', () => {
    const javaName = bridge.match(/NAME = "([^"]+)"/)?.[1];
    expect(javaName).toBeTruthy();
    expect(entry).toContain(`SHELL_SYNC_BRIDGE = '${javaName}'`);
  });

  it('uses the wake type the server sends, on both sides', () => {
    const javaType = wake.match(/TYPE = "([^"]+)"/)?.[1];
    expect(javaType).toBeTruthy();
    expect(fcmClient).toContain(`FCM_SYNC_WAKE = '${javaType}'`);
  });

  it('receives a wake in the shell rather than in the plugin service', () => {
    expect(manifest).toContain('android:name=".SyncMessagingService"');
    expect(manifest).toContain('tools:node="remove"');
    expect(messagingService).toContain('ShellSyncWake.isWake');
    // The plugin's own two jobs must survive the takeover, or a visible push
    // stops reaching the page and a rotated token stops being registered.
    expect(messagingService).toContain('PushNotificationsPlugin.sendRemoteMessage');
    expect(messagingService).toContain('PushNotificationsPlugin.onNewToken');
  });
});
