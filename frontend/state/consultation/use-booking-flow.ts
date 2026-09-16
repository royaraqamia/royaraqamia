'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AvailabilitySlot, ConsultationPackage } from '@/shared/contracts/consultation';
import {
  fetchAvailableSlots,
  fetchConsultationPackages,
  submitBooking,
} from '@/frontend/api/consultation';

export const BOOKING_STEPS = ['package', 'details', 'slots'] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export interface BookingContactDraft {
  full_name: string;
  phone_whatsapp: string;
  topic_description: string;
}

export interface CreatedBooking {
  id: string;
  referenceCode: string;
}

const EMPTY_CONTACT: BookingContactDraft = {
  full_name: '',
  phone_whatsapp: '',
  topic_description: '',
};

export interface UseBookingFlowResult {
  stepIndex: number;
  step: BookingStep;
  packages: ConsultationPackage[];
  selectedPackage: ConsultationPackage | null;
  selectPackage: (packageId: string) => void;
  contact: BookingContactDraft;
  updateContact: (patch: Partial<BookingContactDraft>) => void;
  slots: AvailabilitySlot[];
  slotsLoading: boolean;
  selectedSlotIds: string[];
  toggleSlot: (slotId: string) => void;
  clearSlots: () => void;
  requiredSessions: number;
  canProceed: boolean;
  submitting: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  createdBooking: CreatedBooking | null;
  next: () => void;
  back: () => void;
  goTo: (step: BookingStep) => void;
  confirmBooking: () => Promise<void>;
}

/**
 * Wizard state machine for /consultation/book.
 * Anonymous and unpaid — no account, no payment step. A submitted request is
 * pending until an operator confirms it.
 */
export function useBookingFlow(
  options: { initialPackages?: ConsultationPackage[] } = {}
): UseBookingFlowResult {
  const { initialPackages } = options;
  const hasInitialPackages = initialPackages !== undefined;
  const [stepIndex, setStepIndex] = useState(0);
  const [packages, setPackages] = useState<ConsultationPackage[]>(initialPackages ?? []);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [contact, setContact] = useState<BookingContactDraft>(EMPTY_CONTACT);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createdBooking, setCreatedBooking] = useState<CreatedBooking | null>(null);

  useEffect(() => {
    // Packages are server-rendered into the page; only fetch when absent.
    if (hasInitialPackages) return;
    let cancelled = false;
    fetchConsultationPackages().then((list) => {
      if (!cancelled) setPackages(list);
    });
    return () => {
      cancelled = true;
    };
  }, [hasInitialPackages]);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const fresh = await fetchAvailableSlots();
      setSlots(fresh);
      // Drop selections that disappeared (freed/deleted) while away.
      setSelectedSlotIds((ids) => {
        const available = new Set(fresh.map((s) => s.id));
        const kept = ids.filter((id) => available.has(id));
        return kept.length === ids.length ? ids : kept;
      });
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === selectedPackageId) ?? null,
    [packages, selectedPackageId]
  );

  const toggleSlot = useCallback((slotId: string) => {
    setSelectedSlotIds((current) =>
      current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId]
    );
    setError(null);
  }, []);

  function updateContact(patch: Partial<BookingContactDraft>) {
    setContact((current) => ({ ...current, ...patch }));
    setError(null);
  }

  const requiredSessions = selectedPackage?.sessions_count ?? 1;
  const step: BookingStep = BOOKING_STEPS[stepIndex] ?? 'package';

  const canProceed = useMemo(() => {
    switch (step) {
      case 'package':
        return Boolean(selectedPackage);
      case 'details':
        return (
          contact.full_name.trim().length > 1 &&
          contact.phone_whatsapp.trim().length > 5 &&
          contact.topic_description.trim().length >= 10
        );
      case 'slots':
        return selectedSlotIds.length === requiredSessions && !slotsLoading;
      default:
        return false;
    }
  }, [step, selectedPackage, contact, selectedSlotIds, requiredSessions, slotsLoading]);

  const next = useCallback(() => {
    if (!canProceed) return;
    if (BOOKING_STEPS[stepIndex] === 'details') {
      void loadSlots();
    }
    if (BOOKING_STEPS[stepIndex] === 'slots') {
      // Keep selection ordered chronologically for the summary.
      setSelectedSlotIds((ids) =>
        slots
          .filter((s) => ids.includes(s.id))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
          .map((s) => s.id)
      );
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, BOOKING_STEPS.length - 1));
  }, [canProceed, stepIndex, loadSlots, slots]);

  const back = useCallback(() => {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback((target: BookingStep) => {
    const index = BOOKING_STEPS.indexOf(target);
    if (index >= 0 && index < BOOKING_STEPS.length - 1) {
      setError(null);
      setStepIndex(index);
    }
  }, []);

  const confirmBooking = useCallback(async () => {
    if (!selectedPackage || submitting) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await submitBooking({
        package_id: selectedPackage.id,
        slot_ids: selectedSlotIds,
        full_name: contact.full_name.trim(),
        phone_whatsapp: contact.phone_whatsapp.trim(),
        topic_description: contact.topic_description.trim(),
      });
      if (result.success && result.bookingId && result.referenceCode) {
        setCreatedBooking({ id: result.bookingId, referenceCode: result.referenceCode });
      } else {
        setError(result.error ?? 'تعذر إنشاء الحجز.');
        setFieldErrors(result.fieldErrors ?? {});
      }
    } catch {
      setError('حدث خطأ غير متوقع، حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedPackage, submitting, selectedSlotIds, contact]);

  return {
    stepIndex,
    step,
    packages,
    selectedPackage,
    selectPackage: (packageId) => {
      setSelectedPackageId(packageId);
      setSelectedSlotIds([]);
      setError(null);
    },
    contact,
    updateContact,
    slots,
    slotsLoading,
    selectedSlotIds,
    toggleSlot,
    clearSlots: () => setSelectedSlotIds([]),
    requiredSessions,
    canProceed,
    submitting,
    error,
    fieldErrors,
    createdBooking,
    next,
    back,
    goTo,
    confirmBooking,
  };
}
