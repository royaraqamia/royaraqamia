'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  TOPIC_DESCRIPTION_MIN,
  type AvailabilitySlot,
  type ConsultationPackage,
} from '@/shared/contracts/consultation';
import {
  fetchAvailableSlots,
  fetchConsultationPackages,
  submitBooking,
} from '@/frontend/api/consultation';
import { useSubmissionReceipt } from '@/frontend/shared/use-submission-receipt';
import {
  BOOKING_STEPS,
  bookingFlowInitialState,
  bookingFlowReducer,
  stepAt,
  OFFLINE_BOOKING,
  PACKAGES_UNAVAILABLE,
  SLOTS_UNAVAILABLE,
  UNEXPECTED_BOOKING_ERROR,
  type BookingContactDraft,
  type BookingStep,
} from './use-booking-flow.reducer';

export {
  BOOKING_STEPS,
  type BookingContactDraft,
  type BookingStep,
} from './use-booking-flow.reducer';

export interface CreatedBooking {
  id: string;
  referenceCode: string;
}

export interface UseBookingFlowResult {
  stepIndex: number;
  step: BookingStep;
  packages: ConsultationPackage[];
  /** Set when the package read failed; the step shows it instead of "none". */
  packagesError: string | null;
  /** Runs the package read again. */
  retryPackages: () => void;
  selectedPackage: ConsultationPackage | null;
  selectPackage: (packageId: string) => void;
  contact: BookingContactDraft;
  updateContact: (patch: Partial<BookingContactDraft>) => void;
  /** Validate a single field (used on blur) and surface its message inline. */
  validateField: (field: keyof BookingContactDraft) => void;
  slots: AvailabilitySlot[];
  slotsLoading: boolean;
  /** Set when the availability read failed; the step shows it instead of "none". */
  slotsError: string | null;
  /** Runs the availability read again. */
  retrySlots: () => void;
  selectedSlotIds: string[];
  toggleSlot: (slotId: string) => void;
  clearSlots: () => void;
  requiredSessions: number;
  canProceed: boolean;
  submitting: boolean;
  /** Whether the device currently has a connection. Booking is online-only. */
  online: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  /** The reference code of the booking just made, restored across a refresh. */
  createdBooking: CreatedBooking | null;
  /** Forgets the remembered receipt and starts a fresh booking. */
  startOver: () => void;
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
  const [state, dispatch] = useReducer(
    bookingFlowReducer,
    initialPackages ?? [],
    bookingFlowInitialState
  );

  // The receipt survives a refresh; only the reference code is remembered, so
  // the booking id is filled in from the stored code when present.
  const receipt = useSubmissionReceipt('consultation');
  const createdBooking: CreatedBooking | null = receipt.referenceCode
    ? { id: '', referenceCode: receipt.referenceCode }
    : null;

  useEffect(() => {
    const sync = () =>
      dispatch({
        type: 'onlineChanged',
        online: typeof navigator === 'undefined' || navigator.onLine !== false,
      });
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      dispatch({ type: 'packagesLoaded', packages: await fetchConsultationPackages() });
    } catch {
      dispatch({ type: 'packagesFailed', message: PACKAGES_UNAVAILABLE });
    }
  }, []);

  useEffect(() => {
    // Packages are server-rendered into the page; only fetch when absent.
    if (hasInitialPackages) return;
    void loadPackages();
  }, [hasInitialPackages, loadPackages]);

  const loadSlots = useCallback(async () => {
    dispatch({ type: 'slotsLoadingStarted' });
    try {
      dispatch({ type: 'slotsLoaded', slots: await fetchAvailableSlots() });
    } catch {
      dispatch({ type: 'slotsFailed', message: SLOTS_UNAVAILABLE });
    }
  }, []);

  const selectedPackage = useMemo(
    () => state.packages.find((pkg) => pkg.id === state.selectedPackageId) ?? null,
    [state.packages, state.selectedPackageId]
  );

  const toggleSlot = useCallback((slotId: string) => {
    dispatch({ type: 'slotToggled', slotId });
  }, []);

  const updateContact = (patch: Partial<BookingContactDraft>) => {
    dispatch({ type: 'contactPatched', patch });
  };

  const validateField = useCallback((field: keyof BookingContactDraft) => {
    dispatch({ type: 'fieldValidated', field });
  }, []);

  const requiredSessions = selectedPackage?.sessions_count ?? 1;
  const step: BookingStep = stepAt(state.stepIndex);

  const canProceed = useMemo(() => {
    switch (step) {
      case 'package':
        return Boolean(selectedPackage);
      case 'details':
        return (
          state.contact.full_name.trim().length > 1 &&
          state.contact.phone_whatsapp.trim().length > 5 &&
          state.contact.topic_description.trim().length >= TOPIC_DESCRIPTION_MIN
        );
      case 'slots':
        return state.selectedSlotIds.length === requiredSessions && !state.slotsLoading;
      default:
        return false;
    }
  }, [
    step,
    selectedPackage,
    state.contact,
    state.selectedSlotIds,
    requiredSessions,
    state.slotsLoading,
  ]);

  const next = useCallback(() => {
    if (!canProceed) return;
    if (step === 'package') {
      void loadSlots();
    }
    dispatch({ type: 'stepAdvanced' });
  }, [canProceed, step, loadSlots]);

  const back = useCallback(() => {
    dispatch({ type: 'stepBacked' });
  }, []);

  const goTo = useCallback((target: BookingStep) => {
    dispatch({ type: 'stepJumped', index: BOOKING_STEPS.indexOf(target) });
  }, []);

  const confirmBooking = useCallback(async () => {
    if (!selectedPackage || state.submitting) return;
    // Online-only: a booking must not queue, because it reserves a scarce slot
    // that could collide with another device's booking by the time it replays.
    if (!state.online) {
      dispatch({ type: 'bookingRefused', message: OFFLINE_BOOKING });
      return;
    }
    dispatch({ type: 'bookingStarted' });
    try {
      const result = await submitBooking({
        package_id: selectedPackage.id,
        slot_ids: state.selectedSlotIds,
        full_name: state.contact.full_name.trim(),
        phone_whatsapp: state.contact.phone_whatsapp.trim(),
        topic_description: state.contact.topic_description.trim(),
      });
      if (result.success && result.bookingId && result.referenceCode) {
        receipt.remember(result.referenceCode);
        dispatch({ type: 'bookingFinished' });
      } else {
        dispatch({
          type: 'bookingFailed',
          message: result.error ?? 'تعذر إنشاء الحجز.',
          fieldErrors: result.fieldErrors ?? {},
        });
      }
    } catch {
      dispatch({ type: 'bookingFailed', message: UNEXPECTED_BOOKING_ERROR });
    }
  }, [
    selectedPackage,
    state.submitting,
    state.selectedSlotIds,
    state.contact,
    state.online,
    receipt,
  ]);

  return {
    stepIndex: state.stepIndex,
    step,
    packages: state.packages,
    packagesError: state.packagesError,
    retryPackages: () => void loadPackages(),
    selectedPackage,
    selectPackage: (packageId) => dispatch({ type: 'packageSelected', packageId }),
    contact: state.contact,
    updateContact,
    validateField,
    slots: state.slots,
    slotsLoading: state.slotsLoading,
    slotsError: state.slotsError,
    retrySlots: () => void loadSlots(),
    selectedSlotIds: state.selectedSlotIds,
    toggleSlot,
    clearSlots: () => dispatch({ type: 'slotsCleared' }),
    requiredSessions,
    canProceed,
    submitting: state.submitting,
    online: state.online,
    error: state.error,
    fieldErrors: state.fieldErrors,
    createdBooking,
    startOver: () => {
      receipt.dismiss();
      dispatch({ type: 'startedOver' });
    },
    next,
    back,
    goTo,
    confirmBooking,
  };
}
