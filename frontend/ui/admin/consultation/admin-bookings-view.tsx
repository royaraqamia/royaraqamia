'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import type {
  ConsultationBooking,
  ConsultationBookingStatus,
} from '@/shared/contracts/consultation';
import { CONSULTATION_BOOKING_STATUS_LABELS } from '@/shared/contracts/consultation';
import { adminBookingAction, adminListBookings } from '@/frontend/api/consultation-admin';
import {
  formatSessionDateDamascus,
  formatSessionTimeDamascus,
} from '@/frontend/shared/consultation-time';
import { Button } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: CONSULTATION_BOOKING_STATUS_LABELS.pending },
  { value: 'confirmed', label: CONSULTATION_BOOKING_STATUS_LABELS.confirmed },
  { value: 'rejected', label: CONSULTATION_BOOKING_STATUS_LABELS.rejected },
  { value: 'cancelled', label: CONSULTATION_BOOKING_STATUS_LABELS.cancelled },
  { value: '', label: 'الكل' },
];

const STATUS_BADGE: Record<ConsultationBookingStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  confirmed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  rejected: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

export function AdminBookingsView() {
  const [status, setStatus] = useState('pending');
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
      setMessage(action === 'confirm' ? 'تم تأكيد الحجز.' : 'تم رفض الطلب وتحرير المواعيد.');
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
                  <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                    {b.reference_code}
                  </span>
                </div>
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-bold',
                    STATUS_BADGE[b.status]
                  )}
                >
                  {CONSULTATION_BOOKING_STATUS_LABELS[b.status]}
                </span>
              </header>

              <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="inline text-muted-foreground">الباقة: </dt>
                  <dd className="inline font-bold">{b.package_name ?? b.package_id}</dd>
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
              </div>

              {b.status === 'pending' && (
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
