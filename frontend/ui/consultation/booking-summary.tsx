'use client';

import { useState } from 'react';
import {
  BadgeCheck,
  CalendarX2,
  CircleDollarSign,
  Clock3,
  Hourglass,
  ShieldQuestion,
} from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  REGION_LABELS,
  USER_CANCELLABLE_STATUSES,
  type ConsultationBooking,
  type ConsultationBookingStatus,
} from '@/shared/contracts/consultation';
import { formatSessionDualLine } from '@/frontend/shared/consultation-time';
import { useExpiryCountdown } from '@/frontend/state/consultation/use-expiry-countdown';
import { cancelMyBooking } from '@/frontend/api/consultation';
import { WhatsappReceiptButton } from '@/frontend/ui/consultation/whatsapp-receipt-button';
import { cn } from '@/frontend/shared/cn';

interface BookingSummaryProps {
  booking: ConsultationBooking;
  whatsappUrl: string;
  onChanged: () => void;
}

const STATUS_META: Record<ConsultationBookingStatus, { label: string; className: string }> = {
  pending_payment: {
    label: 'بانتظار الدفع',
    className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  },
  awaiting_review: {
    label: 'قيد المراجعة',
    className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/40',
  },
  confirmed: {
    label: 'مؤكّد',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  },
  rejected: {
    label: 'مرفوض',
    className: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40',
  },
  cancelled: {
    label: 'ملغى',
    className: 'bg-muted text-muted-foreground border-border',
  },
  expired: {
    label: 'منتهي',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export function BookingSummary({ booking, whatsappUrl, onChanged }: BookingSummaryProps) {
  const [cancelling, setCancelling] = useState(false);
  const countdown = useExpiryCountdown(
    booking.status === 'pending_payment' ? booking.expires_at : null
  );
  const cancellable = USER_CANCELLABLE_STATUSES.includes(booking.status);

  async function handleCancel() {
    if (!window.confirm('هل تريد إلغاء هذا الحجز؟ سيُحرَّر الموعد لغيرك.')) return;
    setCancelling(true);
    try {
      await cancelMyBooking(booking.id);
      onChanged();
    } finally {
      setCancelling(false);
    }
  }

  const meta = STATUS_META[booking.status];

  return (
    <article className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-foreground">{booking.package_name ?? 'باقة استشارة'}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            رقم الحجز:{' '}
            <span dir="ltr" className="font-mono">
              {booking.id.slice(0, 8).toUpperCase()}
            </span>
          </p>
        </div>
        <span className={cn('rounded-full border px-3 py-1 text-xs font-bold', meta.className)}>
          {meta.label}
        </span>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-4 text-primary shrink-0" aria-hidden="true" />
          <dt className="text-muted-foreground">المبلغ:</dt>
          <dd className="font-semibold text-foreground">${booking.amount_due_usd}</dd>
        </div>
        <div className="flex items-center gap-2">
          <ShieldQuestion className="size-4 text-primary shrink-0" aria-hidden="true" />
          <dt className="text-muted-foreground">الدفع:</dt>
          <dd className="font-semibold text-foreground">
            {PAYMENT_METHOD_LABELS[booking.payment_method]} ({REGION_LABELS[booking.region]})
          </dd>
        </div>
      </dl>

      <ul className="space-y-1 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        {booking.sessions.map((slot) => (
          <li key={slot.id || slot.starts_at}>• {formatSessionDualLine(slot).localLine}</li>
        ))}
      </ul>

      {/* 24h countdown — only meaningful while unpaid */}
      {booking.status === 'pending_payment' && (
        <p
          className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold',
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
      )}

      {/* Pending approval — clicking the WhatsApp button never self-confirms */}
      {booking.status === 'awaiting_review' && (
        <p
          className="flex items-start gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-300"
          role="status"
        >
          <Hourglass className="size-4 mt-0.5 shrink-0 animate-pulse" aria-hidden="true" />
          <span>
            استلمنا علمًا بأنك أرسلت الإيصال. الحجز الآن <strong>قيد المراجعة</strong> من فريقنا،
            وسنؤكده عبر واتساب بعد التحقق من مطابقة الإيصال.
          </span>
        </p>
      )}

      {booking.status === 'confirmed' && (
        <p
          className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
          role="status"
        >
          <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
          تم تأكيد حجزك! نراك في الموعد المحدد.
        </p>
      )}

      {(booking.status === 'rejected' || booking.status === 'expired') &&
        booking.rejected_reason && (
          <p className="text-sm text-muted-foreground">سبب الرفض: {booking.rejected_reason}</p>
        )}

      <footer className="flex flex-col sm:flex-row gap-3 pt-1">
        {booking.status === 'pending_payment' && !countdown.expired && (
          <div className="flex-1">
            <WhatsappReceiptButton
              booking={booking}
              whatsappUrl={whatsappUrl}
              onMarked={onChanged}
            />
          </div>
        )}
        {cancellable && !countdown.expired && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-destructive/50 px-5 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-60 disabled:cursor-wait"
          >
            <CalendarX2 className="size-4" aria-hidden="true" />
            {cancelling ? 'جارٍ الإلغاء...' : 'إلغاء الحجز'}
          </button>
        )}
      </footer>
    </article>
  );
}
