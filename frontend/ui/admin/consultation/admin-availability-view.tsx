'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { AvailabilitySlot } from '@/shared/contracts/consultation';
import {
  adminCreateSlot,
  adminDeleteSlot,
  adminListSlots,
} from '@/frontend/api/consultation-admin';
import {
  formatSessionDateDamascus,
  formatSessionTimeDamascus,
} from '@/frontend/shared/consultation-time';
import { Label } from '@/frontend/ui/primitives/label';
import { DatePicker } from '@/frontend/ui/primitives/date-picker';
import { TimePicker } from '@/frontend/ui/primitives/time-picker';
import { cn } from '@/frontend/shared/cn';

/** Local datetime-local value → UTC ISO with offset. */
function toIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function AdminAvailabilityView() {
  const [slots, setSlots] = useState<
    Array<AvailabilitySlot & { active_booking_id: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const startsAt = startDate && startTime ? `${startDate}T${startTime}` : '';
  const endsAt = endDate && endTime ? `${endDate}T${endTime}` : '';
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setSlots(await adminListSlots());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!startsAt || !endsAt) {
      setMessage({ ok: false, text: 'حدّد وقت البداية والنهاية.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await adminCreateSlot({
      starts_at: toIso(startsAt),
      ends_at: toIso(endsAt),
    });
    setSaving(false);
    if (result.success) {
      setMessage({ ok: true, text: 'تمت إضافة الموعد.' });
      setStartDate('');
      setStartTime('');
      setEndDate('');
      setEndTime('');
      void refresh();
    } else {
      setMessage({ ok: false, text: result.error ?? 'فشل إضافة الموعد.' });
    }
  }

  async function handleDelete(slotId: string) {
    if (!window.confirm('حذف هذا الموعد؟')) return;
    setDeletingId(slotId);
    setMessage(null);
    const result = await adminDeleteSlot(slotId);
    setDeletingId(null);
    if (result.success) {
      void refresh();
    } else {
      setMessage({ ok: false, text: result.error ?? 'فشل حذف الموعد.' });
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="rounded-2xl border border-border bg-card p-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
        noValidate
      >
        <div className="form-field space-y-1.5">
          <Label className="form-label">بداية الموعد</Label>
          <div className="flex gap-2">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="التاريخ"
              aria-label="تاريخ بداية الموعد"
              className="flex-1 bg-muted border-border rounded-xl"
            />
            <TimePicker value={startTime} onChange={setStartTime} aria-label="وقت بداية الموعد" />
          </div>
        </div>
        <div className="form-field space-y-1.5">
          <Label className="form-label">نهاية الموعد</Label>
          <div className="flex gap-2">
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="التاريخ"
              aria-label="تاريخ نهاية الموعد"
              className="flex-1 bg-muted border-border rounded-xl"
            />
            <TimePicker value={endTime} onChange={setEndTime} aria-label="وقت نهاية الموعد" />
          </div>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-60 w-full sm:w-auto"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            إضافة موعد
          </button>
        </div>
      </form>

      {message && (
        <p
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            message.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          )}
          role="status"
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : slots.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-muted-foreground">
          لا توجد مواعيد قادمة — أضف أول موعد من النموذج أعلاه.
        </p>
      ) : (
        <ul className="space-y-2">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <span className="text-sm font-bold text-foreground">
                {formatSessionDateDamascus(slot.starts_at)} —{' '}
                {formatSessionTimeDamascus(slot.starts_at)}–
                {formatSessionTimeDamascus(slot.ends_at)}{' '}
                <span className="text-muted-foreground">(دمشق)</span>
              </span>
              <span className="flex items-center gap-3">
                {slot.active_booking_id ? (
                  <span className="rounded-full bg-sky-500/15 border border-sky-500/40 px-3 py-1 text-xs font-bold text-sky-600 dark:text-sky-400">
                    محجوز
                  </span>
                ) : (
                  <span className="rounded-full bg-muted border border-border px-3 py-1 text-xs text-muted-foreground">
                    متاح
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(slot.id)}
                  disabled={deletingId === slot.id || Boolean(slot.active_booking_id)}
                  aria-label="حذف الموعد"
                  className="inline-flex items-center justify-center rounded-full border border-destructive/50 p-2.5 text-destructive hover:bg-destructive/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingId === slot.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
