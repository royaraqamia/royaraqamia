import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android shell loads the live site over the web instead of bundling a
 * static export: this app is server-rendered (`controller → service →
 * repository`), uses Server Actions, and authenticates with Supabase cookies,
 * none of which survive a `next export`.
 *
 * `CAPACITOR_SERVER_URL` exists so a device can point at a local dev server
 * (an emulator reaches the host on `http://10.0.2.2:3000`). Production is the
 * canonical origin, and `cleartext` is derived rather than hard-coded: this site
 * is HTTPS-only, so shipping mixed content in release would be a regression.
 *
 * NOTE: `server.url` means the native bridge is injected into a *remote*
 * document. Capacitor only does that for origins it knows about, and there is a
 * long-standing upstream bug for origins that are not the configured app URL
 * (ionic-team/capacitor#7454). `scripts/verify-bridge.mjs` exists to prove the
 * bridge is live on the installed build before anything depends on it.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://royaraqamia.com';

const config: CapacitorConfig = {
  appId: 'com.royaraqamia.app',
  appName: 'رؤيَة رقَميَّة',
  // Deliberately not `public`: with `server.url` set, the WebView never reads
  // bundled assets, and copying `public/` (~3.6 MB of icons, manifest and the
  // scanner wasm) into the APK would be dead weight in every install. This
  // directory holds the one page the CLI requires `webDir` to contain.
  webDir: 'capacitor-web',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    allowNavigation: ['royaraqamia.com', '*.royaraqamia.com'],
  },
  android: {
    // The site is HTTPS with a strict CSP; allowing mixed content or cleartext
    // would only widen the attack surface of the WebView.
    allowMixedContent: false,
    captureInput: true,
    backgroundColor: '#0f172a',
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      // The site owns its own header, so it must not be drawn under the status
      // bar — overlaying it would put the navbar's first row beneath the clock.
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
