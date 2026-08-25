'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AvailabilitySlot,
  type ConsultationPackage,
  type ConsultationPaymentMethod,
  type ConsultationRegion,
} from '@/shared/contracts/consultation';
import {
  fetchAvailableSlots,
  fetchConsultationPackages,
  submitBooking,
} from '@/frontend/api/consultation';

export const BOOKING_STEPS = ['package', 'details', 'slots', 'payment'] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export interface BookingContactDraft {
  full_name: string;
  phone_whatsapp: string;
  topic_description: string;
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
  region: ConsultationRegion;
  setRegion: (region: ConsultationRegion) => void;
  paymentMethod: ConsultationPaymentMethod;
  setPaymentMethod: (method: ConsultationPaymentMethod) => void;
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
  createdBookingId: string | null;
  next: () => void;
  back: () => void;
  goTo: (step: BookingStep) => void;
  confirmBooking: () => Promise<void>;
}

/**
 * Wizard state machine for /consultation/book.
 * Payment method follows the chosen region by default but stays overridable.
 * Email is not collected — the server uses the authenticated account's email.
 */
export function useBookingFlow(): UseBookingFlowResult {
  const [stepIndex, setStepIndex] = useState(0);
  const [packages, setPackages] = useState<ConsultationPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [contact, setContact] = useState<BookingContactDraft>(EMPTY_CONTACT);
  const [region, setRegion] = useState<ConsultationRegion>('syria');
  const [paymentOverride, setPaymentOverride] = useState<ConsultationPaymentMethod | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchConsultationPackages().then((list) => {
      if (!cancelled) setPackages(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const fresh = await fetchAvailableSlots();
      setSlots(fresh);
      // Drop selections that disappeared (freed/expired/deleted) while away.
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

  // Default payment method tracks the region until the user overrides it.
  const paymentMethod: ConsultationPaymentMethod =
    paymentOverride ?? (region === 'syria' ? 'shamcash' : 'moneygram');

  const handleSetRegion = useCallback((next: ConsultationRegion) => {
    setRegion(next);
    setPaymentOverride(null); // snap back to the region's default method
  }, []);

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
      case 'payment':
        return true;
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
        region,
        payment_method: paymentMethod,
      });
      if (result.success && result.bookingId) {
        setCreatedBookingId(result.bookingId);
      } else {
        setError(result.error ?? 'تعذر إنشاء الحجز.');
        setFieldErrors(result.fieldErrors ?? {});
      }
    } catch {
      setError('حدث خطأ غير متوقع، حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedPackage, submitting, selectedSlotIds, contact, region, paymentMethod]);

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
    region,
    setRegion: handleSetRegion,
    paymentMethod,
    setPaymentMethod: setPaymentOverride,
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
    createdBookingId,
    next,
    back,
    goTo,
    confirmBooking,
  };
}
