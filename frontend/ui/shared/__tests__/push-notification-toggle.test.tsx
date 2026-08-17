import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PushNotificationToggle } from '../push-notification-toggle';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    isPushSupported: vi.fn(),
    isPushDisabledByUser: vi.fn(),
    applicationServerKeyMatches: vi.fn(),
    subscribeToPush: vi.fn(),
    unsubscribeFromPush: vi.fn(),
    registerPushSubscriptionChangeHandler: vi.fn(),
  },
}));

vi.mock('@/frontend/api/push', () => mocks);

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
  mocks.registerPushSubscriptionChangeHandler.mockResolvedValue(() => {});
  mocks.subscribeToPush.mockResolvedValue('subscribed');
  mocks.unsubscribeFromPush.mockResolvedValue(undefined);
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

  it('auto-heals a dropped subscription when the user has not disabled push', async () => {
    render(<PushNotificationToggle />);
    await waitFor(() => {
      expect(mocks.subscribeToPush).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps a subscription whose application server key still matches', async () => {
    const { subscription } = installGlobals({ existing: true });
    render(<PushNotificationToggle />);
    await waitFor(() => {
      expect(mocks.applicationServerKeyMatches).toHaveBeenCalled();
    });
    expect(mocks.subscribeToPush).not.toHaveBeenCalled();
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
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
