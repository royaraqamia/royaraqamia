import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('@/frontend/transport/http', () => ({
  request: mockRequest,
  ApiError: class ApiError extends Error {},
}));

import {
  applicationServerKeyMatches,
  isPushDisabledByUser,
  setPushDisabledByUser,
  subscribeToPush,
  unsubscribeFromPush,
} from '../push';

const FAKE_ENDPOINT = 'https://push.example.com/sub-id';

function makeSubscription() {
  return {
    endpoint: FAKE_ENDPOINT,
    toJSON: () => ({ endpoint: FAKE_ENDPOINT }),
    unsubscribe: vi.fn(async () => true),
  };
}

function installPushGlobals({ permission = 'granted', existing = false } = {}) {
  const subscription = makeSubscription();
  Object.defineProperty(window, 'PushManager', { value: class PushManager {}, configurable: true });
  Object.defineProperty(window, 'Notification', {
    value: { permission, requestPermission: vi.fn(async () => permission) },
    configurable: true,
  });
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => (existing ? subscription : null)),
      subscribe: vi.fn(async () => subscription),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  });
  return { subscription, registration };
}

function cleanupPushGlobals() {
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(navigator, 'serviceWorker');
}

beforeEach(() => {
  window.localStorage.clear();
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanupPushGlobals();
  vi.restoreAllMocks();
});

describe('push disabled preference', () => {
  it('defaults to enabled when no preference is stored', () => {
    expect(isPushDisabledByUser()).toBe(false);
  });

  it('persists the disabled flag and clears it', () => {
    setPushDisabledByUser(true);
    expect(isPushDisabledByUser()).toBe(true);
    setPushDisabledByUser(false);
    expect(isPushDisabledByUser()).toBe(false);
  });

  it('unsubscribeFromPush flags the user as disabled', async () => {
    const { subscription } = installPushGlobals({ existing: true });
    await unsubscribeFromPush();
    expect(isPushDisabledByUser()).toBe(true);
    expect(mockRequest).toHaveBeenCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('subscribeToPush clears the disabled flag when it succeeds', async () => {
    installPushGlobals();
    setPushDisabledByUser(true);
    const result = await subscribeToPush();
    expect(result).toBe('subscribed');
    expect(isPushDisabledByUser()).toBe(false);
  });

  it('subscribeToPush returns denied without subscribing when permission is not granted', async () => {
    installPushGlobals({ permission: 'denied' });
    const result = await subscribeToPush();
    expect(result).toBe('denied');
    expect(isPushDisabledByUser()).toBe(false);
  });
});

describe('applicationServerKeyMatches', () => {
  // 65 raw bytes: 0x04 prefix + 64-byte P-256 public point.
  const VALID_KEY = new Uint8Array(65).fill(7);
  const OTHER_KEY = new Uint8Array(65).fill(9);
  const KEY_BASE64 = Buffer.from(VALID_KEY).toString('base64url');

  function subWithKey(key: Uint8Array | null) {
    return {
      getKey: vi.fn(() => key),
    } as unknown as PushSubscription;
  }

  it('returns true when the raw key bytes match the base64 key', () => {
    expect(applicationServerKeyMatches(subWithKey(VALID_KEY), KEY_BASE64)).toBe(true);
  });

  it('returns false when the keys differ', () => {
    expect(applicationServerKeyMatches(subWithKey(OTHER_KEY), KEY_BASE64)).toBe(false);
  });

  it('returns false when getKey returns null', () => {
    expect(applicationServerKeyMatches(subWithKey(null), KEY_BASE64)).toBe(false);
  });

  it('returns false when the base64 key is empty', () => {
    expect(applicationServerKeyMatches(subWithKey(VALID_KEY), '')).toBe(false);
  });

  it('returns false when getKey is missing', () => {
    expect(applicationServerKeyMatches({} as PushSubscription, KEY_BASE64)).toBe(false);
  });

  it('returns false on differing lengths', () => {
    const short = new Uint8Array(5);
    expect(applicationServerKeyMatches(subWithKey(short), KEY_BASE64)).toBe(false);
  });
});
