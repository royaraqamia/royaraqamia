import {
  BookingContactSchema,
  type AvailabilitySlot,
  type ConsultationBooking,
  type ConsultationPackage,
} from '@/shared/contracts/consultation';
import type { BookingContactDraft } from '@/frontend/state/consultation/use-booking-flow';

export const CONTACT_FIELDS: readonly (keyof BookingContactDraft)[] = [
  'full_name',
  'phone_whatsapp',
  'topic_description',
];

export function fieldError(field: keyof BookingContactDraft, value: string): string | undefined {
  const result = BookingContactSchema.shape[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/**
 * One edit session: the contact draft, the reschedule options loaded beside it,
 * and the request that submits both. The setters always moved two or three of
 * these at once, so they are one transition here.
 */
export interface BookingEditState {
  contact: BookingContactDraft;
  fieldErrors: Record<string, string>;
  submitError: string | null;
  submitting: boolean;
  packages: ConsultationPackage[];
  slots: AvailabilitySlot[];
  slotsLoading: boolean;
  packageId: string;
  slotIds: string[];
}

export type BookingEditAction =
  | { type: 'slotsLoadingStarted' }
  | { type: 'slotsLoaded'; slots: AvailabilitySlot[] }
  | { type: 'slotsLoadingFinished' }
  | { type: 'optionsLoaded'; packages: ConsultationPackage[]; slotIds: string[] }
  | { type: 'contactPatched'; patch: Partial<BookingContactDraft> }
  | { type: 'packageSelected'; packageId: string }
  | { type: 'slotToggled'; slotId: string }
  | { type: 'validationFailed'; fieldErrors: Record<string, string> }
  | { type: 'submitErrorCleared' }
  | { type: 'submitStarted' }
  | { type: 'submitFailed'; message: string; fieldErrors?: Record<string, string> }
  | { type: 'submitFinished' };

export function bookingEditInitialState(booking: ConsultationBooking): BookingEditState {
  return {
    contact: {
      full_name: booking.full_name,
      phone_whatsapp: booking.phone_whatsapp,
      topic_description: booking.topic_description,
    },
    fieldErrors: {},
    submitError: null,
    submitting: false,
    packages: [],
    slots: [],
    slotsLoading: false,
    packageId: booking.package_id,
    slotIds: [],
  };
}

function withoutFixedErrors(
  fieldErrors: Record<string, string>,
  patch: Partial<BookingContactDraft>
): Record<string, string> {
  const touched = (Object.keys(patch) as (keyof BookingContactDraft)[]).filter(
    (field) => fieldErrors[field]
  );
  if (touched.length === 0) return fieldErrors;
  const next = { ...fieldErrors };
  for (const field of touched) {
    if (!fieldError(field, patch[field] ?? '')) delete next[field];
  }
  return next;
}

export function bookingEditReducer(
  state: BookingEditState,
  action: BookingEditAction
): BookingEditState {
  switch (action.type) {
    case 'slotsLoadingStarted':
      return { ...state, slotsLoading: true };

    case 'slotsLoaded':
      return { ...state, slots: action.slots };

    case 'slotsLoadingFinished':
      return { ...state, slotsLoading: false };

    case 'optionsLoaded':
      return { ...state, packages: action.packages, slotIds: action.slotIds };

    case 'contactPatched':
      return {
        ...state,
        contact: { ...state.contact, ...action.patch },
        submitError: null,
        fieldErrors: withoutFixedErrors(state.fieldErrors, action.patch),
      };

    case 'packageSelected':
      return { ...state, packageId: action.packageId };

    case 'slotToggled':
      return {
        ...state,
        slotIds: state.slotIds.includes(action.slotId)
          ? state.slotIds.filter((id) => id !== action.slotId)
          : [...state.slotIds, action.slotId],
      };

    case 'validationFailed':
      return { ...state, fieldErrors: action.fieldErrors };

    case 'submitErrorCleared':
      return state.submitError === null ? state : { ...state, submitError: null };

    case 'submitStarted':
      return { ...state, submitting: true, submitError: null };

    case 'submitFailed':
      return {
        ...state,
        submitError: action.message,
        fieldErrors: action.fieldErrors ?? {},
      };

    case 'submitFinished':
      return { ...state, submitting: false };
  }
}

/** Every contact field that fails the shared contract, keyed by field. */
export function contactErrors(contact: BookingContactDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of CONTACT_FIELDS) {
    const message = fieldError(field, contact[field]);
    if (message) errors[field] = message;
  }
  return errors;
}
