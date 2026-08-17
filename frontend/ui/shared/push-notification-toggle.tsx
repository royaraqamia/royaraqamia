'use client';

import { useEffect, useState, useCallback } from 'react';
import { BellRing, BellOff, Ban } from 'lucide-react';
import {
  applicationServerKeyMatches,
  isPushDisabledByUser,
  isPushSupported,
  registerPushSubscriptionChangeHandler,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/frontend/api/push';
import { VAPID_PUBLIC_KEY } from '@/frontend/shared/constants';
import { cn } from '@/frontend/shared/cn';

type PushToggleState =
  { kind: 'unsupported' } | { kind: 'denied' } | { kind: 'enabled' } | { kind: 'disabled' };

export function PushNotificationToggle() {
  const [state, setState] = useState<PushToggleState>({ kind: 'unsupported' });
  const [busy, setBusy] = useState(false);

  const refreshState = useCallback(async () => {
    if (!isPushSupported()) {
      setState({ kind: 'unsupported' });
      return;
    }
    if (Notification.permission === 'denied') {
      setState({ kind: 'denied' });
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setState(subscription ? { kind: 'enabled' } : { kind: 'disabled' });
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  // Auto-heal: permission already granted but no subscription yet, or the
  // existing subscription was bound to a rotated application server key
  // (VAPID regeneration). Re-subscribe automatically in both cases.
  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (isPushDisabledByUser()) return;
    void (async () => {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        if (applicationServerKeyMatches(existing, VAPID_PUBLIC_KEY)) return;
        await existing.unsubscribe();
      }
      const result = await subscribeToPush();
      setState(result === 'subscribed' ? { kind: 'enabled' } : { kind: 'disabled' });
    })();
  }, []);

  // Re-subscribe when the push service rotates the endpoint.
  useEffect(() => {
    let cleanup: () => void = () => undefined;
    void registerPushSubscriptionChangeHandler().then((fn) => {
      cleanup = fn;
    });
    return () => cleanup();
  }, []);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (state.kind === 'enabled') {
        await unsubscribeFromPush();
        setState({ kind: 'disabled' });
        return;
      }
      const result = await subscribeToPush();
      if (result === 'subscribed') setState({ kind: 'enabled' });
      else if (result === 'denied') setState({ kind: 'denied' });
      else setState({ kind: 'disabled' });
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'unsupported') {
    return (
      <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] text-muted-foreground/60">
        <Ban size={14} className="shrink-0" />
        <span>الإشعارات غير مدعومة في هذا المتصفِّح</span>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return (
      <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] text-muted-foreground/70">
        <Ban size={14} className="shrink-0" />
        <span>الإشعارات محظورة في المتصفِّح — فعِّلها من إعدادات الموقع</span>
      </div>
    );
  }

  const isEnabled = state.kind === 'enabled';

  return (
    <button
      onClick={() => void handleToggle()}
      disabled={busy}
      aria-pressed={isEnabled}
      className={cn(
        'flex w-full items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium transition-all duration-150',
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
  );
}
