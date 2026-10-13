import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PushNotificationToggle } from '../push-notification-toggle';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    isPushSupported: vi.fn(),
    isPushDisabledByUser: vi.fn(),
    setPushDisabledByUser: vi.fn(),
    applicationServerKeyMatches: vi.fn(),
    subscribeToPush: vi.fn(),
    unsubscribeFromPush: vi.fn(),
    refreshSubscriptionLiveness: vi.fn(),
  },
}));

const { nativeMocks } = vi.hoisted(() => ({
  nativeMocks: {
    isNativePushSupported: vi.fn(),
    hasNativePushToken: vi.fn(),
    registerNativePush: vi.fn(),
    unregisterNativePush: vi.fn(),
    healNativePushRegistration: vi.fn(),
    installNativePushHandlers: vi.fn(),
  },
}));

vi.mock('@/frontend/api/push', () => mocks);
vi.mock('@/frontend/api/push-native', () => nativeMocks);

function installGlobals({ existing = false } = {}) {
  const subscription = {
    endpoint: 'https://push.example.com/sub-id',
    unsubscribe: vi.fn(async () => true),
  };
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => (existing ? subscription : null)),
      subscribe: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'Notification', {
    value: { permission: 'granted', requestPermission: vi.fn() },
    configurable: true,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  });
  return { registration, subscription };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPushSupported.mockReturnValue(true);
  mocks.isPushDisabledByUser.mockReturnValue(false);
  mocks.applicationServerKeyMatches.mockReturnValue(true);
  mocks.refreshSubscriptionLiveness.mockResolvedValue(undefined);
  mocks.subscribeToPush.mockResolvedValue('subscribed');
  mocks.unsubscribeFromPush.mockResolvedValue(undefined);
  nativeMocks.isNativePushSupported.mockReturnValue(false);
  nativeMocks.hasNativePushToken.mockReturnValue(false);
  nativeMocks.registerNativePush.mockResolvedValue('registered');
  nativeMocks.unregisterNativePush.mockResolvedValue(undefined);
  installGlobals();
});

describe('PushNotificationToggle auto-heal', () => {
  it('does not auto-re-subscribe when the user has explicitly disabled push', async () => {
    mocks.isPushDisabledByUser.mockReturnValue(true);
    render(<PushNotificationToggle />);
    await waitFor(() => {
      expect(mocks.subscribeToPush).not.toHaveBeenCalled();
    });
    const button = await screen.findByRole('button');
    expect(button).toHaveTextContent('تفعيل إشعارات الجهاز');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows push as disabled even when a browser-side subscription exists but the preference is off', async () => {
    mocks.isPushDisabledByUser.mockReturnValue(true);
    installGlobals({ existing: true });
    render(<PushNotificationToggle />);
    const button = await screen.findByRole('button');
    expect(button).toHaveTextContent('تفعيل إشعارات الجهاز');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(mocks.subscribeToPush).not.toHaveBeenCalled();
  });

  it('auto-heals a dropped subscription when the user has not disabled push', async () => {
    render(<PushNotificationToggle />);
    await waitFor(() => {
      expect(mocks.subscribeToPush).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps a subscription whose application server key still matches and refreshes its liveness', async () => {
    const { subscription } = installGlobals({ existing: true });
    render(<PushNotificationToggle />);
    await waitFor(() => {
      expect(mocks.applicationServerKeyMatches).toHaveBeenCalled();
    });
    expect(mocks.subscribeToPush).not.toHaveBeenCalled();
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mocks.refreshSubscriptionLiveness).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: subscription.endpoint })
      );
    });
  });

  it('re-subscribes automatically after a VAPID key rotation', async () => {
    const { subscription } = installGlobals({ existing: true });
    mocks.applicationServerKeyMatches.mockReturnValue(false);
    render(<PushNotificationToggle />);
    await waitFor(() => {
      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.subscribeToPush).toHaveBeenCalledTimes(1);
    });
  });

  it('disables push through unsubscribeFromPush when toggled off', async () => {
    installGlobals({ existing: true });
    render(<PushNotificationToggle />);
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('إيقاف إشعارات الجهاز');
    });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mocks.unsubscribeFromPush).toHaveBeenCalledTimes(1);
    });
  });
});

describe('PushNotificationToggle inside the native shell', () => {
  beforeEach(() => {
    nativeMocks.isNativePushSupported.mockReturnValue(true);
  });

  it('never touches the browser push path', async () => {
    render(<PushNotificationToggle />);

    const button = await screen.findByRole('button');
    expect(button).toHaveTextContent('تفعيل إشعارات الجهاز');
    expect(nativeMocks.installNativePushHandlers).toHaveBeenCalledTimes(1);
    expect(nativeMocks.healNativePushRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.subscribeToPush).not.toHaveBeenCalled();
  });

  it('registers the device token through the native transport', async () => {
    render(<PushNotificationToggle />);
    const button = await screen.findByRole('button');

    fireEvent.click(button);

    await waitFor(() => {
      expect(nativeMocks.registerNativePush).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('إيقاف إشعارات الجهاز');
    });
  });

  it('shows the native blocked message when the permission is refused', async () => {
    nativeMocks.registerNativePush.mockResolvedValue('denied');
    render(<PushNotificationToggle />);
    fireEvent.click(await screen.findByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/إعدادات التطبيق/)).toBeTruthy();
    });
  });

  it('unregisters a device that already has a token', async () => {
    nativeMocks.hasNativePushToken.mockReturnValue(true);
    render(<PushNotificationToggle />);

    const button = await screen.findByRole('button');
    expect(button).toHaveTextContent('إيقاف إشعارات الجهاز');

    fireEvent.click(button);

    await waitFor(() => {
      expect(nativeMocks.unregisterNativePush).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('تفعيل إشعارات الجهاز');
    });
  });
});
