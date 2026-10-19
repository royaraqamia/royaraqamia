'use client';

import { useEffect, useState, useCallback } from 'react';
import { BellRing, BellOff, Ban } from 'lucide-react';
import {
  applicationServerKeyMatches,
  isPushDisabledByUser,
  isPushSupported,
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
  | { kind: 'enabled' }
  | { kind: 'disabled' };

/**
 * What a refused `subscribeToPush()` means for the toggle. A permission denial is
 * the browser's answer and stands until the user changes it in browser settings;
 * an unreachable server is this moment's answer, so the toggle stays live as its
 * own retry and the copy names the connection instead of a setting.
 */
function toFailureState(result: PushSubscribeResult): PushToggleState {
  if (result === 'denied') return { kind: 'denied' };
  if (result === 'unreachable') return { kind: 'unreachable' };
  return { kind: 'disabled' };
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
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setState(subscription ? { kind: 'enabled' } : { kind: 'disabled' });
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
  useEffect(() => {
    if (isNativePushSupported()) return;
    if (!isPushSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (isPushDisabledByUser()) return;
    void (async () => {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        if (applicationServerKeyMatches(existing, VAPID_PUBLIC_KEY)) {
          // Still valid server-side; just refresh its liveness timestamp so
          // the stale-subscription sweep keeps it.
          void refreshSubscriptionLiveness(existing);
          return;
        }
        await existing.unsubscribe();
      }
      const result = await subscribeToPush();
      setState(result === 'subscribed' ? { kind: 'enabled' } : toFailureState(result));
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
      const result = await subscribeToPush();
      if (result === 'subscribed') setState({ kind: 'enabled' });
      else setState(toFailureState(result));
    } finally {
      setBusy(false);
    }
  };

  // Nothing to render until the bridge question is answered, so the browser-only
  // "unsupported" message never flashes inside the app.
  if (state.kind === 'checking') return null;

  if (state.kind === 'unsupported') {
    return (
      <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] text-muted-foreground/60">
        <Ban size={14} className="shrink-0" />
        <span>الإشعارات غير مدعومة في هذا المتصفِّح</span>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return (
      <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] text-muted-foreground/70">
        <Ban size={14} className="shrink-0" />
        <span>
          {native
            ? 'الإشعارات محظورة في النظام — فعِّلها من إعدادات التطبيق'
            : 'الإشعارات محظورة في المتصفِّح — فعِّلها من إعدادات الموقع'}
        </span>
      </div>
    );
  }

  const isEnabled = state.kind === 'enabled';

  return (
    <div className="flex flex-col">
      {/* The toggle below is the retry: an unreachable server is the one failure
          the user can fix by trying again (ADR-0031). */}
      {state.kind === 'unreachable' && (
        <p
          role="status"
          aria-live="polite"
          className="px-3 pt-2.5 text-[11px] text-muted-foreground/70"
        >
          تعذَّر تفعيل الإشعارات — تحقَّق من اتِّصالك ثم أعِد المحاولة.
        </p>
      )}
      <button
        onClick={() => void handleToggle()}
        disabled={busy}
        aria-pressed={isEnabled}
        className={cn(
          'flex w-full items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium transition-safe duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          isEnabled
            ? 'bg-primary/8 text-primary hover:bg-primary/[0.14] dark:bg-primary/10'
            : 'bg-muted/60 text-foreground/80 hover:bg-muted'
        )}
      >
        {isEnabled ? (
          <BellRing size={15} className="shrink-0" />
        ) : (
          <BellOff size={15} className="shrink-0" />
        )}
        <span>{busy ? '...' : isEnabled ? 'إيقاف إشعارات الجهاز' : 'تفعيل إشعارات الجهاز'}</span>
      </button>
    </div>
  );
}
