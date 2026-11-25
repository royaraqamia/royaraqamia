import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  keyboardBridgeAvailable,
  keyboardEnabled,
  keyboardIsDefault,
  openKeyboardPicker,
  openKeyboardSettings,
} from '@/frontend/shared/keyboard';

/** Installed only inside the shell; absent in a browser and on older WebViews. */
function bridgeWith(overrides: Record<string, unknown> = {}) {
  const bridge = {
    available: vi.fn(() => true),
    enabled: vi.fn(() => true),
    isDefault: vi.fn(() => false),
    openSettings: vi.fn(),
    openPicker: vi.fn(),
    ...overrides,
  };
  vi.stubGlobal('RoyShellKeyboard', bridge);
  return bridge;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the keyboard bridge in a browser', () => {
  it('reads false and does nothing when no bridge was injected', () => {
    expect(keyboardBridgeAvailable()).toBe(false);
    expect(keyboardEnabled()).toBe(false);
    expect(keyboardIsDefault()).toBe(false);
    expect(() => openKeyboardSettings()).not.toThrow();
    expect(() => openKeyboardPicker()).not.toThrow();
  });

  it('also survives a bridge older than these methods', () => {
    vi.stubGlobal('RoyShellKeyboard', {});
    expect(keyboardBridgeAvailable()).toBe(false);
    expect(keyboardEnabled()).toBe(false);
    expect(keyboardIsDefault()).toBe(false);
    expect(() => openKeyboardSettings()).not.toThrow();
    expect(() => openKeyboardPicker()).not.toThrow();
  });
});

describe('the keyboard bridge in the shell', () => {
  it('reads the three booleans from Android', () => {
    const bridge = bridgeWith({ enabled: vi.fn(() => true), isDefault: vi.fn(() => true) });
    expect(keyboardBridgeAvailable()).toBe(true);
    expect(keyboardEnabled()).toBe(true);
    expect(keyboardIsDefault()).toBe(true);
    expect(bridge.available).toHaveBeenCalledTimes(1);
    expect(bridge.enabled).toHaveBeenCalledTimes(1);
    expect(bridge.isDefault).toHaveBeenCalledTimes(1);
  });

  it('does not claim a usable IME when the system reports none', () => {
    bridgeWith({ available: vi.fn(() => false), isDefault: vi.fn(() => false) });
    expect(keyboardBridgeAvailable()).toBe(false);
    expect(keyboardEnabled()).toBe(true);
    expect(keyboardIsDefault()).toBe(false);
  });

  it('opens settings and the picker instead of trying to switch silently', () => {
    const bridge = bridgeWith();
    openKeyboardSettings();
    openKeyboardPicker();
    expect(bridge.openSettings).toHaveBeenCalledTimes(1);
    expect(bridge.openPicker).toHaveBeenCalledTimes(1);
  });

  it('never throws when a native call fails', () => {
    const failing = vi.fn(() => {
      throw new Error('bridge unavailable');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    bridgeWith({
      available: failing,
      enabled: failing,
      isDefault: failing,
      openSettings: failing,
      openPicker: failing,
    });

    expect(keyboardBridgeAvailable()).toBe(false);
    expect(keyboardEnabled()).toBe(false);
    expect(keyboardIsDefault()).toBe(false);
    expect(() => openKeyboardSettings()).not.toThrow();
    expect(() => openKeyboardPicker()).not.toThrow();
  });
});
