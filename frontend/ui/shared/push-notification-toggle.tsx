'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import {
  applicationServerKeyMatches,
  isPushDisabledByUser,
  isPushSubscriptionPendingSync,
  isPushSupported,
  pushRetryKind,
  refreshSubscriptionLiveness,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSubscribeResult,
} from '@/frontend/api/push';
import {
  hasNativePushToken,
  healNativePushRegistration,
  installNativePushHandlers,
  isNativePushSupported,
  registerNativePush,
  unregisterNativePush,
} from '@/frontend/api/push-native';
import { VAPID_PUBLIC_KEY } from '@/frontend/shared/constants';
import { cn } from '@/frontend/shared/cn';

type PushToggleState =
  | { kind: 'checking' }
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  /** The registration could not reach the server; the toggle stays for a retry. */
  | { kind: 'unreachable' }
  /** The server refused and asked us to wait; retrying now only refills the bucket. */
  | { kind: 'rateLimited' }
  /** The session is gone, so the server has no account to attach the device to. */
  | { kind: 'unauthorized' }
  /** The server answered, but not with a reason this screen can act on. */
  | { kind: 'failed' }
  | { kind: 'enabled' }
  | { kind: 'disabled' };

/**
 * What a refused `subscribeToPush()` means for the toggle. Only a permission
 * denial is the browser's answer; a refused save is the server's, and each cause
 * gets its own sentence instead of the connection copy it used to share.
 */
function toFailureState(result: PushSubscribeResult): PushToggleState {
  switch (result) {
    case 'denied':
      return { kind: 'denied' };
    case 'rateLimited':
      return { kind: 'rateLimited' };
    case 'unauthorized':
      return { kind: 'unauthorized' };
    case 'unreachable':
      return { kind: 'unreachable' };
    case 'failed':
      return { kind: 'failed' };
    default:
      return { kind: 'disabled' };
  }
}

function toResultState(result: PushSubscribeResult): PushToggleState {
  return result === 'subscribed' ? { kind: 'enabled' } : toFailureState(result);
}

export function PushNotificationToggle() {
  const [state, setState] = useState<PushToggleState>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);
  // The shell and the browser reach push through different transports, and the
  // answer only exists on the client (the bridge is injected after hydration).
  const [native, setNative] = useState(false);

  const refreshState = useCallback(async (isNative: boolean) => {
    if (isNative) {
      // Inside the app the token registry is the source of truth: a stored token
      // means this device is registered, whatever the browser would report.
      setState(
        isPushDisabledByUser() || !hasNativePushToken() ? { kind: 'disabled' } : { kind: 'enabled' }
      );
      return;
    }
    if (!isPushSupported()) {
      setState({ kind: 'unsupported' });
      return;
    }
    if (Notification.permission === 'denied') {
      setState({ kind: 'denied' });
      return;
    }
    // The stored preference wins over a browser-side subscription: the service
    // worker may have re-subscribed after an endpoint rotation before it saw
    // the opt-out marker, and the UI must never advertise push as enabled.
    if (isPushDisabledByUser()) {
      setState({ kind: 'disabled' });
      return;
    }
    // A failure from an earlier visit stands until its cooldown runs out. Asking
    // again on every visit is what kept the subscribe bucket full, so the answer
    // the user already has is the one to show.
    const remembered = pushRetryKind();
    if (remembered) {
      setState({ kind: remembered });
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    // A subscription the server has not acknowledged cannot deliver, so it is
    // not "enabled": the pending marker is cleared by the next successful save.
    setState(
      subscription && !isPushSubscriptionPendingSync() ? { kind: 'enabled' } : { kind: 'disabled' }
    );
  }, []);

  useEffect(() => {
    const isNative = isNativePushSupported();
    setNative(isNative);
    if (isNative) {
      installNativePushHandlers();
      // Refresh a token FCM may have rotated while the app was closed.
      healNativePushRegistration();
    }
    void refreshState(isNative);
  }, [refreshState]);

  // Auto-heal: permission already granted but no subscription yet, or the
  // existing subscription was bound to a rotated application server key
  // (VAPID regeneration). Re-subscribe automatically in both cases. Endpoint
  // rotation while no page is open is handled inside the service worker.
  //
  // The transport question is asked here directly rather than read off state:
  // this effect runs in the same commit as the one that sets `native`, so state
  // would still say "web" inside the shell and the WebView would be subscribed
  // to a transport that cannot deliver.
  //
  // A remembered failure stops this before it asks: the cooldown exists so a
  // refusal is not repeated on every mount, which is what turned one rate limit
  // into a permanent one.
  useEffect(() => {
    if (isNativePushSupported()) return;
    if (!isPushSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (isPushDisabledByUser()) return;
    if (pushRetryKind()) return;
    void (async () => {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        if (applicationServerKeyMatches(existing, VAPID_PUBLIC_KEY)) {
          // Still valid server-side; the same POST refreshes its liveness
          // timestamp and retries a save that never landed.
          setState(toResultState(await refreshSubscriptionLiveness(existing)));
          return;
        }
        await existing.unsubscribe();
      }
      setState(toResultState(await subscribeToPush()));
    })();
  }, []);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (native) {
        if (state.kind === 'enabled') {
          await unregisterNativePush();
          setState({ kind: 'disabled' });
          return;
        }
        const result = await registerNativePush();
        if (result === 'registered') setState({ kind: 'enabled' });
        else if (result === 'denied') setState({ kind: 'denied' });
        else setState({ kind: 'disabled' });
        return;
      }

      if (state.kind === 'enabled') {
        await unsubscribeFromPush();
        setState({ kind: 'disabled' });
        return;
      }
      setState(toResultState(await subscribeToPush()));
    } finally {
      setBusy(false);
    }
  };

  // Nothing to render until the bridge question is answered, so the browser-only
  // "unsupported" message never flashes inside the app.
  if (state.kind === 'checking') return null;

  // A browser with no push support has no switch to offer, and a dead row on the
  // account page reads as a broken setting rather than as an absent feature.
  if (state.kind === 'unsupported') return null;

  const isEnabled = state.kind === 'enabled';
  const blocked = state.kind === 'denied';

  // Every failure names the cause the toggle actually has (ADR-0031): the
  // connection only for a request that never left, the wait for a rate limit,
  // the session for a 401, and a plain retry for anything else.
  const statusMessage =
    state.kind === 'denied'
      ? native
        ? 'الإشعارات مرفوضة من إعدادات التطبيق؛ اسمح بها من هناك ثم أعِد المحاولة.'
        : 'الإشعارات مرفوضة من إعدادات المتصفِّح؛ اسمح بها من هناك ثم أعِد المحاولة.'
      : state.kind === 'unreachable'
        ? 'تعذَّر تفعيل الإشعارات — تحقَّق من اتِّصالك ثم أعِد المحاولة.'
        : state.kind === 'rateLimited'
          ? 'تجاوزتَ حدَّ محاولات تفعيل الإشعارات — أعِد المحاولة بعد قليل.'
          : state.kind === 'unauthorized'
            ? 'انتهت جلستك — سجِّل الدخول من جديد ثم أعِد المحاولة.'
            : state.kind === 'failed'
              ? 'تعذَّر تفعيل الإشعارات — أعِد المحاولة.'
              : null;

  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-4 text-start">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* The row is drawn exactly like every other account row (#1023): the
            bare 16px purple glyph the `AccountRow`s use, not a chip of its own
            — a bordered tile beside a list of bare glyphs read as a different
            kind of control. */}
        <Bell aria-hidden="true" className="w-4 h-4 shrink-0 text-primary" />

        <div className="min-w-0">
          <p className="max-sm:text-sm font-bold text-foreground sm:text-base">إشعارات الجهاز</p>
          {statusMessage ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-1 text-[11px] leading-6 text-muted-foreground"
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label="إشعارات الجهاز"
        disabled={busy || blocked}
        onClick={() => void handleToggle()}
        dir="ltr"
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border px-1 transition-colors focus-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          isEnabled
            ? 'border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600'
            : 'border-border/70 bg-muted'
        )}
      >
        <span
          className={cn(
            'inline-block size-5 rounded-full bg-background shadow-sm transition-transform duration-200',
            isEnabled ? 'translate-x-0' : 'translate-x-[18px]'
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
