'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import {
  REGION_LABELS,
  PAYMENT_METHOD_LABELS,
  type ConsultationBooking,
  type ConsultationBookingStatus,
} from '@/shared/contracts/consultation';
import { adminBookingAction, adminListBookings } from '@/frontend/api/consultation-admin';
import {
  formatSessionDateDamascus,
  formatSessionTimeDamascus,
} from '@/frontend/shared/consultation-time';
import { Button } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'awaiting_review', label: 'قيد المراجعة' },
  { value: 'pending_payment', label: 'بانتظار الدفع' },
  { value: 'confirmed', label: 'مؤكّد' },
  { value: 'rejected', label: 'مرفوض' },
  { value: 'cancelled', label: 'ملغى' },
  { value: 'expired', label: 'منتهي' },
  { value: '', label: 'الكل' },
];

const STATUS_BADGE: Record<ConsultationBookingStatus, string> = {
  pending_payment: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  awaiting_review: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/40',
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  rejected: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40',
  cancelled: 'bg-muted text-muted-foreground border-border',
  expired: 'bg-muted text-muted-foreground border-border',
};

export function AdminBookingsView() {
  const [status, setStatus] = useState('awaiting_review');
  const [bookings, setBookings] = useState<ConsultationBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await adminListBookings(
      1,
      50,
      status ? (status as ConsultationBookingStatus) : undefined
    );
    setBookings(result.data ?? []);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(bookingId: string, action: 'confirm' | 'reject') {
    let reason: string | undefined;
    if (action === 'reject') {
      reason = window.prompt('سبب الرفض (يظهر لك فقط للأرشفة، اختياري):') ?? undefined;
    }
    setActingId(bookingId);
    setMessage(null);
    const result = await adminBookingAction(bookingId, action, reason);
    setActingId(null);
    if (result.success) {
      setMessage(action === 'confirm' ? 'تم تأكيد الحجز.' : 'تم رفض الحجز وتحرير المواعيد.');
      void refresh();
    } else {
      setMessage(result.error ?? 'فشل تنفيذ الإجراء.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="تصفية الحالة">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === filter.value}
            onClick={() => setStatus(filter.value)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 inline-flex items-center',
              status === filter.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {filter.label}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          className="rounded-full gap-2 ms-auto"
        >
          <RefreshCw className="size-4" />
          تحديث
        </Button>
      </div>

      {message && (
        <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : bookings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-muted-foreground">
          لا توجد حجوزات في هذه القائمة.
        </p>
      ) : (
        <ul className="space-y-4">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold text-foreground">{b.full_name}</span>
                  <a
                    href={`https://wa.me/${b.phone_whatsapp.replace(/[^\d]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="text-sm text-primary hover:underline"
                  >
                    {b.phone_whatsapp}
                  </a>
                  <span dir="ltr" className="text-xs text-muted-foreground">
                    {b.email}
                  </span>
                </div>
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-bold',
                    STATUS_BADGE[b.status]
                  )}
                >
                  {STATUS_FILTERS.find((f) => f.value === b.status)?.label ?? b.status}
                </span>
              </header>

              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="inline text-muted-foreground">الباقة: </dt>
                  <dd className="inline font-bold">{b.package_name ?? b.package_id}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">المبلغ: </dt>
                  <dd className="inline font-bold">${b.amount_due_usd}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">الدفع: </dt>
                  <dd className="inline font-bold">
                    {PAYMENT_METHOD_LABELS[b.payment_method]} ({REGION_LABELS[b.region]})
                  </dd>
                </div>
              </dl>

              <div className="text-sm">
                <p className="text-muted-foreground mb-1">الموضوع:</p>
                <p className="rounded-xl bg-muted px-4 py-2.5 leading-relaxed whitespace-pre-wrap wrap-break-word">
                  {b.topic_description}
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="mb-1 font-bold text-foreground">المواعيد (بتوقيت دمشق):</p>
                <ul>
                  {b.sessions.map((s) => (
                    <li key={s.id || s.starts_at}>
                      • {formatSessionDateDamascus(s.starts_at)} —{' '}
                      {formatSessionTimeDamascus(s.starts_at)}–
                      {formatSessionTimeDamascus(s.ends_at)}
                    </li>
                  ))}
                </ul>
                {b.receipt_sent_at && (
                  <p className="mt-1 text-sky-600 dark:text-sky-400">أرسل الإيصال عبر واتساب ✓</p>
                )}
              </div>

              {(b.status === 'pending_payment' || b.status === 'awaiting_review') && (
                <footer className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void act(b.id, 'confirm')}
                    disabled={actingId === b.id}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-sm font-bold text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-60"
                  >
                    {actingId === b.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    تأكيد الحجز
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(b.id, 'reject')}
                    disabled={actingId === b.id}
                    className="inline-flex items-center gap-2 rounded-full border border-destructive/60 text-destructive hover:bg-destructive/10 px-5 py-2 text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-60"
                  >
                    <X className="size-4" />
                    رفض
                  </button>
                </footer>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
