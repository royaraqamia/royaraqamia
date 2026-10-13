import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRequest, mockIsDisabled, mockSetDisabled } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockIsDisabled: vi.fn(),
  mockSetDisabled: vi.fn(),
}));

vi.mock('@/frontend/transport/http', () => ({
  request: mockRequest,
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/frontend/api/push', () => ({
  isPushDisabledByUser: mockIsDisabled,
  setPushDisabledByUser: mockSetDisabled,
}));

vi.mock('@/frontend/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const TOKEN_KEY = 'royaraqamia.push.native.token';

type Listener = (payload: unknown) => void;

function installBridge(
  options: {
    platform?: string;
    permissions?: { receive?: string };
    /** Emits the registration event from `register()`. */
    registerEmits?: unknown;
    registrationError?: boolean;
  } = {}
) {
  const listeners = new Map<string, Listener>();
  const plugin = {
    requestPermissions: vi.fn(async () => options.permissions ?? { receive: 'granted' }),
    register: vi.fn(async () => {
      if (options.registrationError) {
        listeners.get('registrationError')?.({ error: 'boom' });
        return;
      }
      if (options.registerEmits !== undefined) {
        listeners.get('registration')?.(options.registerEmits);
      }
    }),
    addListener: vi.fn(async (event: string, callback: Listener) => {
      listeners.set(event, callback);
      return { remove: vi.fn() };
    }),
  };
  Object.defineProperty(globalThis, 'Capacitor', {
    value: {
      isNativePlatform: () => true,
      getPlatform: () => options.platform ?? 'android',
      Plugins: { PushNotifications: plugin },
    },
    configurable: true,
    writable: true,
  });
  return { plugin, listeners };
}

function clearBridge() {
  Reflect.deleteProperty(globalThis, 'Capacitor');
}

async function loadModule() {
  return import('../push-native');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  window.localStorage.clear();
  mockRequest.mockResolvedValue({ success: true });
  mockIsDisabled.mockReturnValue(false);
});

afterEach(() => {
  clearBridge();
  vi.useRealTimers();
});

describe('isNativePushSupported', () => {
  it('is false in a plain browser', async () => {
    const { isNativePushSupported } = await loadModule();
    expect(isNativePushSupported()).toBe(false);
  });

  it('is false when the shell has no push plugin', async () => {
    Object.defineProperty(globalThis, 'Capacitor', {
      value: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} },
      configurable: true,
      writable: true,
    });
    const { isNativePushSupported } = await loadModule();
    expect(isNativePushSupported()).toBe(false);
  });

  it('is true inside the shell with the plugin installed', async () => {
    installBridge();
    const { isNativePushSupported } = await loadModule();
    expect(isNativePushSupported()).toBe(true);
  });
});

describe('registerNativePush', () => {
  it('registers the FCM token with the server and remembers it locally', async () => {
    const { plugin } = installBridge({ registerEmits: { value: 'fcm-token-1' } });
    const { registerNativePush, hasNativePushToken } = await loadModule();

    await expect(registerNativePush()).resolves.toBe('registered');

    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    expect(plugin.register).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('/api/push/devices', {
      method: 'POST',
      body: JSON.stringify({ token: 'fcm-token-1', platform: 'android' }),
    });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('fcm-token-1');
    expect(hasNativePushToken()).toBe(true);
    expect(mockSetDisabled).toHaveBeenCalledWith(false);
  });

  it('reports the ios platform when the shell runs on iOS', async () => {
    installBridge({ platform: 'ios', registerEmits: { value: 'fcm-token-ios' } });
    const { registerNativePush } = await loadModule();

    await registerNativePush();

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/push/devices',
      expect.objectContaining({ body: JSON.stringify({ token: 'fcm-token-ios', platform: 'ios' }) })
    );
  });

  it('does not touch the server when the permission is refused', async () => {
    const { plugin } = installBridge({ permissions: { receive: 'denied' } });
    const { registerNativePush } = await loadModule();

    await expect(registerNativePush()).resolves.toBe('denied');

    expect(plugin.register).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('treats a permission answer without `receive` as granted (older devices)', async () => {
    installBridge({ permissions: {}, registerEmits: { value: 'fcm-token-1' } });
    const { registerNativePush } = await loadModule();

    await expect(registerNativePush()).resolves.toBe('registered');
  });

  it('reports failure when FCM returns a registration error', async () => {
    installBridge({ registrationError: true });
    const { registerNativePush, hasNativePushToken } = await loadModule();

    await expect(registerNativePush()).resolves.toBe('failed');

    expect(hasNativePushToken()).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('gives up when the token never arrives', async () => {
    installBridge();
    const { registerNativePush } = await loadModule();
    vi.useFakeTimers();

    const pending = registerNativePush();
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toBe('failed');
  });

  it('reports failure when the server rejects the token', async () => {
    installBridge({ registerEmits: { value: 'fcm-token-1' } });
    mockRequest.mockRejectedValue(new Error('500'));
    const { registerNativePush, hasNativePushToken } = await loadModule();

    await expect(registerNativePush()).resolves.toBe('failed');
    expect(hasNativePushToken()).toBe(false);
  });

  it('is unsupported outside the shell', async () => {
    const { registerNativePush } = await loadModule();
    await expect(registerNativePush()).resolves.toBe('unsupported');
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('unregisterNativePush', () => {
  it('deletes the stored token and marks push as disabled', async () => {
    installBridge();
    window.localStorage.setItem(TOKEN_KEY, 'fcm-token-1');
    const { unregisterNativePush } = await loadModule();

    await unregisterNativePush();

    expect(mockRequest).toHaveBeenCalledWith('/api/push/devices', {
      method: 'DELETE',
      body: JSON.stringify({ token: 'fcm-token-1' }),
    });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(mockSetDisabled).toHaveBeenCalledWith(true);
  });

  it('does nothing when the device has no token', async () => {
    installBridge();
    const { unregisterNativePush } = await loadModule();

    await unregisterNativePush();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('clears the local token even when the server call fails', async () => {
    installBridge();
    window.localStorage.setItem(TOKEN_KEY, 'fcm-token-1');
    mockRequest.mockRejectedValue(new Error('offline'));
    const { unregisterNativePush } = await loadModule();

    await expect(unregisterNativePush()).resolves.toBeUndefined();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('healNativePushRegistration', () => {
  it('re-registers when the device is registered and push is not disabled', async () => {
    const { plugin } = installBridge({ registerEmits: { value: 'fcm-token-2' } });
    window.localStorage.setItem(TOKEN_KEY, 'fcm-token-1');
    const { healNativePushRegistration } = await loadModule();

    healNativePushRegistration();

    await vi.waitFor(() => expect(plugin.register).toHaveBeenCalledTimes(1));
  });

  it('does nothing when the user opted out', async () => {
    const { plugin } = installBridge({ registerEmits: { value: 'fcm-token-2' } });
    window.localStorage.setItem(TOKEN_KEY, 'fcm-token-1');
    mockIsDisabled.mockReturnValue(true);
    const { healNativePushRegistration } = await loadModule();

    healNativePushRegistration();

    expect(plugin.register).not.toHaveBeenCalled();
  });

  it('does nothing when the device was never registered', async () => {
    const { plugin } = installBridge({ registerEmits: { value: 'fcm-token-2' } });
    const { healNativePushRegistration } = await loadModule();

    healNativePushRegistration();

    expect(plugin.register).not.toHaveBeenCalled();
  });
});

describe('installNativePushHandlers', () => {
  it('navigates to the path carried by a tapped notification', async () => {
    const { listeners } = installBridge();
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, configurable: true });
    const { installNativePushHandlers } = await loadModule();

    installNativePushHandlers();
    listeners.get('pushNotificationActionPerformed')?.({
      notification: { data: { url: '/community/post-1' } },
    });

    expect(assign).toHaveBeenCalledWith('/community/post-1');
  });

  it('ignores a payload without a usable path', async () => {
    const { listeners } = installBridge();
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, configurable: true });
    const { installNativePushHandlers } = await loadModule();

    installNativePushHandlers();
    listeners.get('pushNotificationActionPerformed')?.({ notification: { data: {} } });
    listeners.get('pushNotificationActionPerformed')?.({
      notification: { data: { url: 'https://evil.example.com' } },
    });

    expect(assign).not.toHaveBeenCalled();
  });

  it('installs the listener only once', async () => {
    const { plugin } = installBridge();
    const { installNativePushHandlers } = await loadModule();

    installNativePushHandlers();
    installNativePushHandlers();

    expect(plugin.addListener).toHaveBeenCalledTimes(1);
  });
});
