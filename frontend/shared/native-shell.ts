import { NATIVE_OAUTH_CALLBACK_URL } from '@/shared/contracts/auth';
import { logger } from '@/frontend/shared/logger';

/**
 * The Capacitor Android shell loads this app over the web, so "am I inside the
 * app?" has to be answered from the bridge Capacitor injects, not from the
 * build.
 *
 * The bridge is read off `window.Capacitor` instead of imported: importing
 * `@capacitor/core` would ship the runtime in every page's bundle for a boolean
 * that is false for every web visitor, and native plugins are reached through
 * `Capacitor.Plugins` rather than their npm packages for the same reason (the
 * package's JavaScript is web implementation we never run — the shell is native).
 * If the bridge is missing — including the upstream case where Capacitor fails to
 * inject it into a remote document (ionic-team/capacitor#7454) — everything here
 * degrades to plain web behaviour rather than throwing.
 */
interface BrowserPlugin {
  open?: (options: { url: string }) => Promise<unknown>;
}

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  /** Registered by the native layer; `Browser` only exists inside the shell. */
  Plugins?: Record<string, BrowserPlugin>;
}

/**
 * Where the system browser hands a finished OAuth flow back to the app. Defined
 * once, in `shared/contracts/auth.ts`, beside the server that sends the flow
 * there; the Android intent filter is the third place that must agree.
 */
export const NATIVE_AUTH_CALLBACK_URL = NATIVE_OAUTH_CALLBACK_URL;

function bridge(): CapacitorBridge | undefined {
  return (globalThis as { Capacitor?: CapacitorBridge }).Capacitor;
}

/** True only inside the native shell — always false in a browser. */
export function isNativeApp(): boolean {
  const capacitor = bridge();
  if (typeof capacitor?.isNativePlatform !== 'function') return false;
  try {
    return capacitor.isNativePlatform() === true;
  } catch {
    return false;
  }
}

export function nativePlatform(): 'android' | 'ios' | 'web' {
  const platform = bridge()?.getPlatform?.();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
}

/**
 * Opens a URL outside the WebView, in the system browser. Resolves `false` when
 * there is no shell or the plugin call fails, so callers can fall back to an
 * ordinary navigation instead of leaving a dead button.
 */
export async function openInSystemBrowser(url: string): Promise<boolean> {
  const browser = bridge()?.Plugins?.Browser;
  if (!isNativeApp() || typeof browser?.open !== 'function') return false;

  try {
    await browser.open({ url });
    return true;
  } catch (error) {
    logger.warn('Failed to open the system browser', { error: String(error) });
    return false;
  }
}
