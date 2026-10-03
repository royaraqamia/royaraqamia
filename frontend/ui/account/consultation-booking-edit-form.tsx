'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/frontend/ui/primitives/button';
import {
  fetchAvailableSlots,
  fetchConsultationPackages,
  updateMyConsultationBooking,
} from '@/frontend/api/consultation';
import {
  BookingContactSchema,
  type AvailabilitySlot,
  type ConsultationBooking,
  type ConsultationPackage,
} from '@/shared/contracts/consultation';
import { cn } from '@/frontend/shared/cn';
import { PackageStep } from '../consultation/steps/package-step';
import { SlotStep } from '../consultation/steps/slot-step';
import { DetailsStep } from '../consultation/steps/details-step';
import type { BookingContactDraft } from '@/frontend/state/consultation/use-booking-flow';

const CONTACT_FIELDS: readonly (keyof BookingContactDraft)[] = [
  'full_name',
  'phone_whatsapp',
  'topic_description',
];

function fieldError(field: keyof BookingContactDraft, value: string): string | undefined {
  const result = BookingContactSchema.shape[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

interface ConsultationBookingEditFormProps {
  booking: ConsultationBooking;
  onSaved: (booking: ConsultationBooking) => void;
  onCancel: () => void;
}

/**
 * Edits a booking the booker owns. Contact and topic always change. The
 * package/slot step is offered only while the booking still holds its slots
 * (pending/confirmed): a confirmed booking loses its holds once rejected or
 * cancelled, and moving them is a reschedule the RPC will refuse.
 */
export function ConsultationBookingEditForm({
  booking,
  onSaved,
  onCancel,
}: ConsultationBookingEditFormProps) {
  const [contact, setContact] = useState<BookingContactDraft>({
    full_name: booking.full_name,
    phone_whatsapp: booking.phone_whatsapp,
    topic_description: booking.topic_description,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reschedulable = booking.status === 'pending' || booking.status === 'confirmed';
  const [packages, setPackages] = useState<ConsultationPackage[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [packageId, setPackageId] = useState<string>(booking.package_id);
  const [slotIds, setSlotIds] = useState<string[]>([]);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const fresh = await fetchAvailableSlots();
      // Keep the booking's own held sessions selectable by re-adding them: they
      // are filtered out of the "available" list because the booking holds them.
      const held = booking.sessions.filter((session) => !fresh.some((s) => s.id === session.id));
      setSlots([...fresh, ...held].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    } finally {
      setSlotsLoading(false);
    }
  }, [booking.sessions]);

  useEffect(() => {
    if (!reschedulable) return;
    let cancelled = false;
    void Promise.all([fetchConsultationPackages(), loadSlots()]).then(([pkgs]) => {
      if (cancelled) return;
      setPackages(pkgs);
      setSlotIds(booking.sessions.map((session) => session.id));
    });
    return () => {
      cancelled = true;
    };
  }, [reschedulable, loadSlots, booking.sessions]);

  function updateContact(patch: Partial<BookingContactDraft>) {
    setContact((current) => ({ ...current, ...patch }));
    setSubmitError(null);
    setFieldErrors((current) => {
      const touched = (Object.keys(patch) as (keyof BookingContactDraft)[]).filter(
        (field) => current[field]
      );
      if (touched.length === 0) return current;
      const next = { ...current };
      for (const field of touched) {
        if (!fieldError(field, patch[field] ?? '')) delete next[field];
      }
      return next;
    });
  }

  const selectedPackage = packages.find((pkg) => pkg.id === packageId) ?? null;
  const requiredSessions = selectedPackage?.sessions_count ?? booking.sessions.length;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const errors: Record<string, string> = {};
    for (const field of CONTACT_FIELDS) {
      const message = fieldError(field, contact[field]);
      if (message) errors[field] = message;
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await updateMyConsultationBooking(booking.id, {
        full_name: contact.full_name.trim(),
        phone_whatsapp: contact.phone_whatsapp.trim(),
        topic_description: contact.topic_description.trim(),
        ...(reschedulable &&
          selectedPackage !== null &&
          slotIds.length === requiredSessions && {
            package_id: packageId,
            slot_ids: slotIds,
          }),
      });

      if (response.success && response.data) {
        onSaved(response.data);
        return;
      }
      setSubmitError(response.error ?? 'تعذّر تحديث الحجز، حاول مرة أخرى.');
      setFieldErrors(response.fieldErrors ?? {});
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleSlot(slotId: string) {
    setSlotIds((current) =>
      current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId]
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-6">
      {reschedulable ? (
        <>
          <section aria-label="الباقة" className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">الباقة والمواعيد</h3>
            <PackageStep packages={packages} selectedId={packageId} onSelect={setPackageId} />
            <SlotStep
              slots={slots}
              loading={slotsLoading}
              selectedIds={slotIds}
              requiredCount={requiredSessions}
              onToggle={toggleSlot}
            />
          </section>
        </>
      ) : (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          لا يحتفظ هذا الحجز بمواعيده في حالته الحاليَّة، لذا يمكنك تعديل بياناتك فقط.
        </p>
      )}

      <section aria-label="بياناتك" className="border-t border-border/50 pt-5">
        <DetailsStep contact={contact} onChange={updateContact} fieldErrors={fieldErrors} />
      </section>

      {submitError && (
        <p
          className={cn(
            'rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'
          )}
          role="alert"
        >
          {submitError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="hero" isLoading={isSubmitting} disabled={isSubmitting}>
          حفظ التَّعديلات
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
