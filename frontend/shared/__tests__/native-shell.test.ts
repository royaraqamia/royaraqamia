import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  NATIVE_AUTH_CALLBACK_URL,
  isNativeApp,
  nativePlatform,
  nativePlugin,
  openInSystemBrowser,
} from '../native-shell';

const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth';

function setBridge(bridge: unknown) {
  (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor = bridge;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'Capacitor');
  vi.restoreAllMocks();
});

describe('isNativeApp', () => {
  it('is false when Capacitor never injected a bridge', () => {
    expect(isNativeApp()).toBe(false);
  });

  it('is false when the bridge cannot answer', () => {
    setBridge({});

    expect(isNativeApp()).toBe(false);
  });

  it('is true when the bridge reports a native platform', () => {
    setBridge({ isNativePlatform: () => true });

    expect(isNativeApp()).toBe(true);
  });

  it('is false when the bridge throws instead of failing a remote-origin page', () => {
    setBridge({
      isNativePlatform: () => {
        throw new Error('bridge gone');
      },
    });

    expect(isNativeApp()).toBe(false);
  });
});

describe('nativePlatform', () => {
  it('reports the shell platform', () => {
    setBridge({ getPlatform: () => 'android' });

    expect(nativePlatform()).toBe('android');
  });

  it('falls back to web', () => {
    setBridge({ getPlatform: () => 'something-else' });

    expect(nativePlatform()).toBe('web');
  });
});

describe('openInSystemBrowser', () => {
  it('does nothing on the web, even if a bridge looks present', async () => {
    const open = vi.fn(async () => undefined);
    setBridge({ isNativePlatform: () => false, Plugins: { Browser: { open } } });

    await expect(openInSystemBrowser(GOOGLE)).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('hands the URL to the native plugin inside the shell', async () => {
    const open = vi.fn(async () => undefined);
    setBridge({ isNativePlatform: () => true, Plugins: { Browser: { open } } });

    await expect(openInSystemBrowser(GOOGLE)).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith({ url: GOOGLE });
  });

  it('reports failure when the plugin is not registered', async () => {
    setBridge({ isNativePlatform: () => true, Plugins: {} });

    await expect(openInSystemBrowser(GOOGLE)).resolves.toBe(false);
  });

  it('reports failure so the caller can navigate instead', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setBridge({
      isNativePlatform: () => true,
      Plugins: {
        Browser: {
          open: async () => {
            throw new Error('no system browser');
          },
        },
      },
    });

    await expect(openInSystemBrowser(GOOGLE)).resolves.toBe(false);
  });
});

describe('nativePlugin', () => {
  it('returns the plugin registered on the bridge', () => {
    const register = vi.fn();
    setBridge({ isNativePlatform: () => true, Plugins: { PushNotifications: { register } } });

    expect(nativePlugin<{ register: unknown }>('PushNotifications')?.register).toBe(register);
  });

  it('returns undefined when the plugin is not installed', () => {
    setBridge({ isNativePlatform: () => true, Plugins: {} });

    expect(nativePlugin('PushNotifications')).toBeUndefined();
  });

  it('returns undefined without a bridge', () => {
    expect(nativePlugin('PushNotifications')).toBeUndefined();
  });

  it('ignores a non-object plugin entry', () => {
    setBridge({ isNativePlatform: () => true, Plugins: { PushNotifications: 'nope' } });

    expect(nativePlugin('PushNotifications')).toBeUndefined();
  });
});

describe('NATIVE_AUTH_CALLBACK_URL', () => {
  it('matches the scheme registered in the Android manifest', () => {
    expect(NATIVE_AUTH_CALLBACK_URL).toBe('royar://auth/callback');
  });
});
