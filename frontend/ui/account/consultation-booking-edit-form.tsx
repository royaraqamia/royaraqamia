'use client';

import { useCallback, useEffect, useReducer } from 'react';

import { Button } from '@/frontend/ui/primitives/button';
import {
  fetchAvailableSlots,
  fetchConsultationPackages,
  updateMyConsultationBooking,
} from '@/frontend/api/consultation';
import type { ConsultationBooking } from '@/shared/contracts/consultation';
import { cn } from '@/frontend/shared/cn';
import { PackageStep } from '../consultation/steps/package-step';
import { SlotStep } from '../consultation/steps/slot-step';
import { DetailsStep } from '../consultation/steps/details-step';
import type { BookingContactDraft } from '@/frontend/state/consultation/use-booking-flow';
import {
  bookingEditInitialState,
  bookingEditReducer,
  contactErrors,
} from './consultation-booking-edit-form.reducer';

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
  const [form, dispatch] = useReducer(bookingEditReducer, booking, bookingEditInitialState);
  const { contact, fieldErrors, submitError, submitting, packages, slots, slotsLoading } = form;
  const { packageId, slotIds } = form;

  const reschedulable = booking.status === 'pending' || booking.status === 'confirmed';
  const selectedPackage = packages.find((pkg) => pkg.id === packageId) ?? null;
  const requiredSessions = selectedPackage?.sessions_count ?? booking.sessions.length;

  const loadSlots = useCallback(async () => {
    dispatch({ type: 'slotsLoadingStarted' });
    try {
      const fresh = await fetchAvailableSlots();
      // Keep the booking's own held sessions selectable by re-adding them: they
      // are filtered out of the "available" list because the booking holds them.
      const held = booking.sessions.filter((session) => !fresh.some((s) => s.id === session.id));
      dispatch({
        type: 'slotsLoaded',
        slots: [...fresh, ...held].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      });
    } finally {
      dispatch({ type: 'slotsLoadingFinished' });
    }
  }, [booking.sessions]);

  useEffect(() => {
    if (!reschedulable) return;
    let cancelled = false;
    void Promise.all([fetchConsultationPackages(), loadSlots()]).then(([pkgs]) => {
      if (cancelled) return;
      dispatch({
        type: 'optionsLoaded',
        packages: pkgs,
        slotIds: booking.sessions.map((session) => session.id),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reschedulable, loadSlots, booking.sessions]);

  function updateContact(patch: Partial<BookingContactDraft>) {
    dispatch({ type: 'contactPatched', patch });
  }

  function toggleSlot(slotId: string) {
    dispatch({ type: 'slotToggled', slotId });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    dispatch({ type: 'submitErrorCleared' });

    const errors = contactErrors(contact);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'validationFailed', fieldErrors: errors });
      return;
    }

    dispatch({ type: 'submitStarted' });
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
      dispatch({
        type: 'submitFailed',
        message: response.error ?? 'تعذّر تحديث الحجز، حاول مرة أخرى.',
        fieldErrors: response.fieldErrors ?? {},
      });
    } finally {
      dispatch({ type: 'submitFinished' });
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-6">
      {reschedulable ? (
        <>
          <section aria-label="الباقة" className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">الباقة والمواعيد</h3>
            <PackageStep
              packages={packages}
              selectedId={packageId}
              onSelect={(id) => dispatch({ type: 'packageSelected', packageId: id })}
            />
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
        <Button type="submit" variant="hero" isLoading={submitting} disabled={submitting}>
          حفظ التَّعديلات
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
