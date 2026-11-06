import { describe, expect, it } from 'vitest';
import type { AvailabilitySlot, ConsultationBooking } from '@/shared/contracts/consultation';
import {
  bookingEditInitialState,
  bookingEditReducer,
  contactErrors,
  fieldError,
  type BookingEditState,
} from '@/frontend/ui/account/consultation-booking-edit-form.reducer';

const BOOKING = {
  id: 'b-1',
  package_id: 'pkg-1',
  status: 'confirmed',
  full_name: 'اسم العميل',
  phone_whatsapp: '+963900000000',
  topic_description: 'موضوع الاستشارة يشرح المشكلة بالتفصيل الكافي للحجز والمراجعة',
  sessions: [{ id: 's-1' }, { id: 's-2' }],
} as unknown as ConsultationBooking;

function stateOf(patch: Partial<BookingEditState> = {}): BookingEditState {
  return { ...bookingEditInitialState(BOOKING), ...patch };
}

function slot(id: string): AvailabilitySlot {
  return { id, starts_at: '2026-05-01T08:00:00.000Z' } as unknown as AvailabilitySlot;
}

describe('bookingEditInitialState', () => {
  it('starts from the booking it edits, with no options loaded yet', () => {
    expect(bookingEditInitialState(BOOKING)).toMatchObject({
      contact: {
        full_name: 'اسم العميل',
        phone_whatsapp: '+963900000000',
        topic_description: 'موضوع الاستشارة يشرح المشكلة بالتفصيل الكافي للحجز والمراجعة',
      },
      packageId: 'pkg-1',
      packages: [],
      slots: [],
      slotIds: [],
      fieldErrors: {},
      submitError: null,
      submitting: false,
    });
  });
});

describe('contactPatched', () => {
  it('drops the submit error and the error of every field the patch fixes', () => {
    const state = bookingEditReducer(
      stateOf({
        contact: { full_name: '', phone_whatsapp: '', topic_description: '' },
        fieldErrors: { full_name: 'مطلوب', topic_description: 'قصير جداً' },
        submitError: 'تعذّر',
      }),
      { type: 'contactPatched', patch: { full_name: 'اسم صحيح' } }
    );

    expect(state.contact.full_name).toBe('اسم صحيح');
    expect(state.fieldErrors).toEqual({ topic_description: 'قصير جداً' });
    expect(state.submitError).toBeNull();
  });

  it('leaves the other errors alone', () => {
    const state = bookingEditReducer(stateOf({ fieldErrors: { full_name: 'مطلوب' } }), {
      type: 'contactPatched',
      patch: { phone_whatsapp: '+963911111111' },
    });

    expect(state.fieldErrors).toEqual({ full_name: 'مطلوب' });
  });
});

describe('options', () => {
  it('records the loaded packages and the booking’s held slots together', () => {
    const state = bookingEditReducer(stateOf(), {
      type: 'optionsLoaded',
      packages: [],
      slotIds: ['s-1', 's-2'],
    });

    expect(state.slotIds).toEqual(['s-1', 's-2']);
  });

  it('tracks the availability read around the result', () => {
    const loading = bookingEditReducer(stateOf(), { type: 'slotsLoadingStarted' });
    expect(loading.slotsLoading).toBe(true);

    const loaded = bookingEditReducer(loading, { type: 'slotsLoaded', slots: [slot('s-3')] });
    expect(loaded.slots).toHaveLength(1);

    expect(bookingEditReducer(loaded, { type: 'slotsLoadingFinished' }).slotsLoading).toBe(false);
  });

  it('toggles a slot on and off', () => {
    const picked = bookingEditReducer(stateOf(), { type: 'slotToggled', slotId: 's-1' });
    expect(picked.slotIds).toEqual(['s-1']);
    expect(bookingEditReducer(picked, { type: 'slotToggled', slotId: 's-1' }).slotIds).toEqual([]);
  });

  it('changes the selected package without touching the slots', () => {
    expect(
      bookingEditReducer(stateOf({ slotIds: ['s-1'] }), {
        type: 'packageSelected',
        packageId: 'pkg-2',
      })
    ).toMatchObject({ packageId: 'pkg-2', slotIds: ['s-1'] });
  });
});

describe('submission', () => {
  it('reports the validation errors without entering the submitting state', () => {
    const state = bookingEditReducer(stateOf(), {
      type: 'validationFailed',
      fieldErrors: { full_name: 'مطلوب' },
    });

    expect(state).toMatchObject({ submitting: false, fieldErrors: { full_name: 'مطلوب' } });
  });

  it('clears the previous submit error when a new attempt starts', () => {
    const state = bookingEditReducer(stateOf({ submitError: 'تعذّر' }), {
      type: 'submitStarted',
    });

    expect(state).toMatchObject({ submitting: true, submitError: null });
  });

  it('keeps the server field errors when the request is refused', () => {
    const state = bookingEditReducer(stateOf({ submitting: true }), {
      type: 'submitFailed',
      message: 'تعذّر',
      fieldErrors: { phone_whatsapp: 'غير صالح' },
    });

    expect(state.submitError).toBe('تعذّر');
    expect(state.fieldErrors).toEqual({ phone_whatsapp: 'غير صالح' });
    expect(state.submitting).toBe(true);

    expect(bookingEditReducer(state, { type: 'submitFinished' }).submitting).toBe(false);
  });
});

describe('contactErrors', () => {
  it('is empty for a valid draft and keyed by field otherwise', () => {
    expect(contactErrors(bookingEditInitialState(BOOKING).contact)).toEqual({});

    const errors = contactErrors({
      full_name: '',
      phone_whatsapp: '',
      topic_description: '',
    });

    expect(Object.keys(errors).sort()).toEqual([
      'full_name',
      'phone_whatsapp',
      'topic_description',
    ]);
  });

  it('matches the shared contract for a single field', () => {
    expect(fieldError('full_name', '')).toBe(
      contactErrors({
        full_name: '',
        phone_whatsapp: '',
        topic_description: '',
      }).full_name
    );
  });
});
