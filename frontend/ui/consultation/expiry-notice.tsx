'use client';

import { memo, useEffect } from 'react';
import { Clock3 } from 'lucide-react';
import { useExpiryCountdown } from '@/frontend/state/consultation/use-expiry-countdown';
import { cn } from '@/frontend/shared/cn';

interface ExpiryNoticeProps {
  expiresAt: string;
  /** Fired exactly once when the deadline passes, so the parent card can hide
   * the now-invalid actions without re-rendering on every tick. */
  onExpired: () => void;
}

function ExpiryNoticeBase({ expiresAt, onExpired }: ExpiryNoticeProps) {
  const countdown = useExpiryCountdown(expiresAt);

  useEffect(() => {
    if (countdown.expired) onExpired();
  }, [countdown.expired, onExpired]);

  return (
    <p
      className={cn(
        'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold',
        countdown.expired
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
      )}
      role="timer"
    >
      <Clock3 className="size-4 shrink-0" aria-hidden="true" />
      {countdown.expired ? (
        <span>انتهت مهلة الدفع وتم تحرير الموعد.</span>
      ) : (
        <span>
          يتبقى لإتمام الدفع وإرسال الإيصال:{' '}
          <span dir="ltr" className="font-mono font-bold">
            {countdown.label}
          </span>
        </span>
      )}
    </p>
  );
}

export const ExpiryNotice = memo(ExpiryNoticeBase);
