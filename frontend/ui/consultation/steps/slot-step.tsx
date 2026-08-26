'use client';

import { useMemo } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import type { AvailabilitySlot } from '@/shared/contracts/consultation';
import {
  formatSessionDamascusHint,
  formatSessionDateLocal,
  formatSessionTimeRangeLocal,
  sessionDayKeyLocal,
} from '@/frontend/shared/consultation-time';
import { cn } from '@/frontend/shared/cn';

interface SlotStepProps {
  slots: AvailabilitySlot[];
  loading: boolean;
  selectedIds: string[];
  requiredCount: number;
  onToggle: (slotId: string) => void;
}

interface DayGroup {
  key: string;
  label: string;
  slots: AvailabilitySlot[];
}

export function SlotStep({ slots, loading, selectedIds, requiredCount, onToggle }: SlotStepProps) {
  const grouped = useMemo(() => {
    const byDay = new Map<string, DayGroup>();
    for (const slot of slots) {
      const key = sessionDayKeyLocal(slot.starts_at);
      const group = byDay.get(key) ?? {
        key,
        label: formatSessionDateLocal(slot.starts_at),
        slots: [],
      };
      group.slots.push(slot);
      byDay.set(key, group);
    }
    return Array.from(byDay.values());
  }, [slots]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-14 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>جاري تحميل المواعيد المُتاحة...</span>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <CalendarClock className="size-10 text-muted-foreground/50 mx-auto" aria-hidden="true" />
        <p className="font-semibold text-foreground">لا توجد مواعيد مُتاحة حاليًّا</p>
        <p className="text-sm text-muted-foreground">تُضاف مواعيد جديدة دوريًّا — جرِّب لاحقًا.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p
        className={cn(
          'text-sm font-semibold rounded-xl px-4 py-2.5 border',
          selectedIds.length === requiredCount
            ? 'bg-primary/10 border-primary/40 text-foreground'
            : 'bg-muted border-border text-muted-foreground'
        )}
        role="status"
      >
        اختر {requiredCount} {requiredCount === 1 ? 'موعدًا' : 'مواعيد'} — تمَّ اختيار{' '}
        {selectedIds.length} من {requiredCount}
      </p>

      <div className="space-y-5 max-h-104 overflow-y-auto pe-1 custom-scrollbar">
        {grouped.map((group) => (
          <div key={group.key}>
            <h4 className="text-sm font-bold text-foreground mb-2">{group.label}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.slots.map((slot) => {
                const selected = selectedIds.includes(slot.id);
                const disabled = !selected && selectedIds.length >= requiredCount;
                const range = formatSessionTimeRangeLocal(slot);
                const damascusHint = formatSessionDamascusHint(slot);
                return (
                  <button
                    key={slot.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => onToggle(slot.id)}
                    title={
                      damascusHint
                        ? `${group.label} • ${range} (بتوقيت دمشق: ${damascusHint})`
                        : `${group.label} • ${range}`
                    }
                    className={cn(
                      'rounded-xl border p-3 text-right transition-all duration-200',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
                        : disabled
                          ? 'border-border bg-muted/50 opacity-45 cursor-not-allowed'
                          : 'border-border bg-card hover:border-primary/60 cursor-pointer'
                    )}
                  >
                    <span className="block text-sm font-semibold">{range}</span>
                    {damascusHint && (
                      <span
                        className={cn(
                          'block text-xs mt-0.5',
                          selected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        )}
                      >
                        بتوقيت دمشق: {damascusHint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
