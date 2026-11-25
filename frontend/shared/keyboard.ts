import { logger } from '@/frontend/shared/logger';

/**
 * The account page's view of Android's input-method state (ADR-0219).
 *
 * The shell injects a plain `addJavascriptInterface` object rather than a
 * Capacitor plugin, because the plugin bridge is not reliably present in the
 * remote document on the WebViews this app still meets (ADR-0043). Here the
 * object is read off `globalThis` rather than imported: a browser has no such
 * object, and every answer degrades to false or a no-op instead of throwing.
 *
 * Nothing typed crosses this boundary (ADR-0220): three booleans and two
 * gestures. Android alone enables an IME and decides which one is the default;
 * the page only reads that decision and opens the system control that changes it.
 */
interface KeyboardBridge {
  available?: () => boolean;
  enabled?: () => boolean;
  isDefault?: () => boolean;
  openSettings?: () => void;
  openPicker?: () => void;
}

function bridge(): KeyboardBridge | undefined {
  return (globalThis as { RoyShellKeyboard?: KeyboardBridge }).RoyShellKeyboard;
}

/** True only on a shell whose IME component is installed and usable. */
export function keyboardBridgeAvailable(): boolean {
  const keyboard = bridge();
  if (typeof keyboard?.available !== 'function') return false;
  try {
    return keyboard.available() === true;
  } catch (error) {
    logger.warn('Failed to read the keyboard bridge', { error: String(error) });
    return false;
  }
}

/** Whether Android has enabled our IME, whether or not it is the default. */
export function keyboardEnabled(): boolean {
  const keyboard = bridge();
  if (typeof keyboard?.enabled !== 'function') return false;
  try {
    return keyboard.enabled() === true;
  } catch (error) {
    logger.warn('Failed to read the enabled IME', { error: String(error) });
    return false;
  }
}

/** Whether Android reports our IME as the chosen one — read, never written. */
export function keyboardIsDefault(): boolean {
  const keyboard = bridge();
  if (typeof keyboard?.isDefault !== 'function') return false;
  try {
    return keyboard.isDefault() === true;
  } catch (error) {
    logger.warn('Failed to read the default IME', { error: String(error) });
    return false;
  }
}

/** Opens Android's input-method settings, where the IME can be enabled. */
export function openKeyboardSettings(): void {
  const keyboard = bridge();
  if (typeof keyboard?.openSettings !== 'function') return;
  try {
    keyboard.openSettings();
  } catch (error) {
    logger.warn('Failed to open the keyboard settings', { error: String(error) });
  }
}

/** Opens Android's picker; the member makes the switch there. */
export function openKeyboardPicker(): void {
  const keyboard = bridge();
  if (typeof keyboard?.openPicker !== 'function') return;
  try {
    keyboard.openPicker();
  } catch (error) {
    logger.warn('Failed to open the keyboard picker', { error: String(error) });
  }
}
