import {
  BookingContactSchema,
  type AvailabilitySlot,
  type ConsultationPackage,
} from '@/shared/contracts/consultation';

export const BOOKING_STEPS = ['package', 'slots', 'details'] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export interface BookingContactDraft {
  full_name: string;
  phone_whatsapp: string;
  topic_description: string;
}

export const EMPTY_CONTACT: BookingContactDraft = {
  full_name: '',
  phone_whatsapp: '',
  topic_description: '',
};

/**
 * Availability and packages are live reads. A request that never reached the
 * server is not an empty calendar and not an empty catalogue, so a failure has
 * its own message instead of the "none available" state those steps show for a
 * genuine absence (ADR-0031).
 */
export const SLOTS_UNAVAILABLE =
  'تعذَّر تحميل المواعيد المُتاحة. تحقَّق من اتِّصالك ثم أعِد المحاولة.';
export const PACKAGES_UNAVAILABLE = 'تعذَّر تحميل الباقات. تحقَّق من اتِّصالك ثم أعِد المحاولة.';
export const OFFLINE_BOOKING =
  'يلزم الاتصال بالإنترنت لإتمام الحجز. تحقَّق من اتِّصالك ثم أعِد المحاولة.';
export const UNEXPECTED_BOOKING_ERROR = 'حدث خطأ غير متوقع، حاول مرة أخرى.';

/**
 * The wizard's whole state. Every field moves through `bookingFlowReducer`, so a
 * step change, a slot selection and a failed submit stay one transition each
 * instead of three setters that must agree.
 */
export interface BookingFlowState {
  stepIndex: number;
  packages: ConsultationPackage[];
  packagesError: string | null;
  selectedPackageId: string | null;
  contact: BookingContactDraft;
  fieldErrors: Record<string, string>;
  slots: AvailabilitySlot[];
  slotsLoading: boolean;
  slotsError: string | null;
  selectedSlotIds: string[];
  submitting: boolean;
  online: boolean;
  error: string | null;
}

export type BookingFlowAction =
  | { type: 'onlineChanged'; online: boolean }
  | { type: 'packagesLoaded'; packages: ConsultationPackage[] }
  | { type: 'packagesFailed'; message: string }
  | { type: 'slotsLoadingStarted' }
  | { type: 'slotsLoaded'; slots: AvailabilitySlot[] }
  | { type: 'slotsFailed'; message: string }
  | { type: 'packageSelected'; packageId: string }
  | { type: 'slotToggled'; slotId: string }
  | { type: 'slotsCleared' }
  | { type: 'contactPatched'; patch: Partial<BookingContactDraft> }
  | { type: 'fieldValidated'; field: keyof BookingContactDraft }
  | { type: 'stepAdvanced' }
  | { type: 'stepBacked' }
  | { type: 'stepJumped'; index: number }
  | { type: 'bookingStarted' }
  | { type: 'bookingRefused'; message: string }
  | { type: 'bookingFailed'; message: string; fieldErrors?: Record<string, string> }
  | { type: 'bookingFinished' }
  | { type: 'startedOver' };

/**
 * Field-level validation delegated to the shared contract schema, so the client
 * never invents a rule the server does not enforce.
 */
export function contactFieldError(
  field: keyof BookingContactDraft,
  value: string
): string | undefined {
  const result = BookingContactSchema.shape[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

export function bookingFlowInitialState(
  initialPackages: ConsultationPackage[] = []
): BookingFlowState {
  return {
    stepIndex: 0,
    packages: initialPackages,
    packagesError: null,
    selectedPackageId: null,
    contact: EMPTY_CONTACT,
    fieldErrors: {},
    slots: [],
    slotsLoading: false,
    slotsError: null,
    selectedSlotIds: [],
    submitting: false,
    // Booking reserves an Availability Slot against a live conflict check, so it
    // is online-only and never queues (ADR-0031). Start "online" so the server and
    // first client render agree, then read the real value in an effect.
    online: true,
    error: null,
  };
}

export function stepAt(index: number): BookingStep {
  return BOOKING_STEPS[index] ?? 'package';
}

function withFieldErrors(
  current: Record<string, string>,
  field: keyof BookingContactDraft,
  message: string | undefined
): Record<string, string> {
  if (current[field] === message) return current;
  const next = { ...current };
  if (message) next[field] = message;
  else delete next[field];
  return next;
}

export function bookingFlowReducer(
  state: BookingFlowState,
  action: BookingFlowAction
): BookingFlowState {
  switch (action.type) {
    case 'onlineChanged':
      return { ...state, online: action.online };

    case 'packagesLoaded':
      return { ...state, packages: action.packages, packagesError: null };

    case 'packagesFailed':
      return { ...state, packagesError: action.message };

    case 'slotsLoadingStarted':
      return { ...state, slotsLoading: true };

    case 'slotsLoaded': {
      // Drop selections that disappeared (freed/deleted) while away.
      const available = new Set(action.slots.map((slot) => slot.id));
      const kept = state.selectedSlotIds.filter((id) => available.has(id));
      return {
        ...state,
        slots: action.slots,
        slotsError: null,
        slotsLoading: false,
        selectedSlotIds:
          kept.length === state.selectedSlotIds.length ? state.selectedSlotIds : kept,
      };
    }

    case 'slotsFailed':
      // Keep whatever is already selected: the submit path runs its own live
      // conflict check, so a booking is still refused server-side if a slot was
      // taken meanwhile. What must not happen is the step reading this as
      // "nothing is open".
      return { ...state, slotsError: action.message, slotsLoading: false };

    case 'packageSelected':
      return {
        ...state,
        selectedPackageId: action.packageId,
        selectedSlotIds: [],
        // A new package means new availability; the old failure was about the old one.
        slotsError: null,
        error: null,
      };

    case 'slotToggled':
      return {
        ...state,
        selectedSlotIds: state.selectedSlotIds.includes(action.slotId)
          ? state.selectedSlotIds.filter((id) => id !== action.slotId)
          : [...state.selectedSlotIds, action.slotId],
        error: null,
      };

    case 'slotsCleared':
      return { ...state, selectedSlotIds: [] };

    case 'contactPatched': {
      const patch = action.patch;
      const touched = (Object.keys(patch) as (keyof BookingContactDraft)[]).filter(
        (field) => state.fieldErrors[field]
      );
      let fieldErrors = state.fieldErrors;
      // Clear a stale error as soon as the user fixes the offending field.
      for (const field of touched) {
        const message = contactFieldError(field, patch[field] ?? '');
        if (!message) fieldErrors = withFieldErrors(fieldErrors, field, undefined);
      }
      return { ...state, contact: { ...state.contact, ...patch }, error: null, fieldErrors };
    }

    case 'fieldValidated':
      return {
        ...state,
        fieldErrors: withFieldErrors(
          state.fieldErrors,
          action.field,
          contactFieldError(action.field, state.contact[action.field])
        ),
      };

    case 'stepAdvanced': {
      const advanced = Math.min(state.stepIndex + 1, BOOKING_STEPS.length - 1);
      if (stepAt(state.stepIndex) !== 'details') {
        return { ...state, error: null, stepIndex: advanced };
      }
      // Keep the selection ordered chronologically for the summary.
      const ordered = [...state.slots]
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .filter((slot) => state.selectedSlotIds.includes(slot.id))
        .map((slot) => slot.id);
      return { ...state, error: null, selectedSlotIds: ordered, stepIndex: advanced };
    }

    case 'stepBacked':
      return { ...state, error: null, stepIndex: Math.max(state.stepIndex - 1, 0) };

    case 'stepJumped':
      if (action.index < 0 || action.index >= BOOKING_STEPS.length - 1) return state;
      return { ...state, error: null, stepIndex: action.index };

    case 'bookingStarted':
      return { ...state, submitting: true, error: null, fieldErrors: {} };

    case 'bookingRefused':
      return { ...state, error: action.message };

    case 'bookingFailed':
      return {
        ...state,
        submitting: false,
        error: action.message,
        fieldErrors: action.fieldErrors ?? {},
      };

    case 'bookingFinished':
      return { ...state, submitting: false };

    case 'startedOver':
      return {
        ...state,
        stepIndex: 0,
        selectedPackageId: null,
        selectedSlotIds: [],
        contact: EMPTY_CONTACT,
        slotsError: null,
        packagesError: null,
        error: null,
        fieldErrors: {},
      };
  }
}
