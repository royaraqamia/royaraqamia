import { describe, expect, it } from 'vitest';
import type { AvailabilitySlot, ConsultationPackage } from '@/shared/contracts/consultation';
import {
  bookingFlowInitialState,
  bookingFlowReducer,
  contactFieldError,
  stepAt,
  OFFLINE_BOOKING,
  SLOTS_UNAVAILABLE,
  type BookingFlowState,
} from '@/frontend/state/consultation/use-booking-flow.reducer';

const PACKAGE = {
  id: 'pkg-1',
  name: 'باقة',
  sessions_count: 2,
  price_usd: 50,
  description: null,
  is_active: true,
} as unknown as ConsultationPackage;

function slot(id: string, startsAt: string): AvailabilitySlot {
  return { id, starts_at: startsAt, ends_at: startsAt } as unknown as AvailabilitySlot;
}

const EARLY = slot('s-early', '2026-05-01T08:00:00.000Z');
const LATE = slot('s-late', '2026-05-02T08:00:00.000Z');

function stateOf(patch: Partial<BookingFlowState> = {}): BookingFlowState {
  return { ...bookingFlowInitialState(), ...patch };
}

describe('bookingFlowInitialState', () => {
  it('starts on the package step, online, with nothing selected', () => {
    expect(bookingFlowInitialState()).toMatchObject({
      stepIndex: 0,
      packages: [],
      selectedPackageId: null,
      selectedSlotIds: [],
      submitting: false,
      online: true,
      error: null,
      fieldErrors: {},
    });
  });

  it('takes the server-rendered packages as its first catalogue', () => {
    expect(bookingFlowInitialState([PACKAGE]).packages).toEqual([PACKAGE]);
  });
});

describe('selection', () => {
  it('drops the slots and the stale availability failure when the package changes', () => {
    const state = bookingFlowReducer(
      stateOf({ selectedSlotIds: ['s-early'], slotsError: SLOTS_UNAVAILABLE, error: 'boom' }),
      { type: 'packageSelected', packageId: 'pkg-1' }
    );

    expect(state).toMatchObject({
      selectedPackageId: 'pkg-1',
      selectedSlotIds: [],
      slotsError: null,
      error: null,
    });
  });

  it('toggles a slot on and off, clearing the error both ways', () => {
    const picked = bookingFlowReducer(stateOf({ error: 'boom' }), {
      type: 'slotToggled',
      slotId: 's-early',
    });
    expect(picked.selectedSlotIds).toEqual(['s-early']);
    expect(picked.error).toBeNull();

    const unpicked = bookingFlowReducer(picked, { type: 'slotToggled', slotId: 's-early' });
    expect(unpicked.selectedSlotIds).toEqual([]);
  });

  it('keeps the same array when a reload prunes nothing', () => {
    const state = stateOf({ selectedSlotIds: ['s-early'] });

    const reloaded = bookingFlowReducer(state, {
      type: 'slotsLoaded',
      slots: [EARLY, LATE],
    });

    expect(reloaded.selectedSlotIds).toBe(state.selectedSlotIds);
    expect(reloaded.slots).toEqual([EARLY, LATE]);
    expect(reloaded.slotsLoading).toBe(false);
    expect(reloaded.slotsError).toBeNull();
  });

  it('drops a selection that disappeared while away', () => {
    const reloaded = bookingFlowReducer(stateOf({ selectedSlotIds: ['s-early', 's-gone'] }), {
      type: 'slotsLoaded',
      slots: [EARLY],
    });

    expect(reloaded.selectedSlotIds).toEqual(['s-early']);
  });

  it('keeps the selection and reports the failure when availability cannot be read', () => {
    const state = bookingFlowReducer(
      stateOf({ selectedSlotIds: ['s-early'], slotsLoading: true }),
      {
        type: 'slotsFailed',
        message: SLOTS_UNAVAILABLE,
      }
    );

    expect(state.selectedSlotIds).toEqual(['s-early']);
    expect(state.slotsError).toBe(SLOTS_UNAVAILABLE);
    expect(state.slotsLoading).toBe(false);
  });

  it('clears every selection on demand', () => {
    expect(
      bookingFlowReducer(stateOf({ selectedSlotIds: ['s-early'] }), { type: 'slotsCleared' })
        .selectedSlotIds
    ).toEqual([]);
  });
});

describe('contact', () => {
  it('merges the patch and drops the error of every field it fixes', () => {
    const state = bookingFlowReducer(
      stateOf({
        contact: { full_name: '', phone_whatsapp: '', topic_description: '' },
        fieldErrors: { full_name: 'مطلوب', topic_description: 'قصير جداً' },
        error: 'boom',
      }),
      { type: 'contactPatched', patch: { full_name: 'اسم صحيح' } }
    );

    expect(state.contact.full_name).toBe('اسم صحيح');
    expect(state.fieldErrors).toEqual({ topic_description: 'قصير جداً' });
    expect(state.error).toBeNull();
  });

  it('keeps an untouched error in place', () => {
    const state = bookingFlowReducer(stateOf({ fieldErrors: { full_name: 'مطلوب' } }), {
      type: 'contactPatched',
      patch: { phone_whatsapp: '+963900000000' },
    });

    expect(state.fieldErrors).toEqual({ full_name: 'مطلوب' });
  });

  it('validates a field against the shared contract, both ways', () => {
    const failing = bookingFlowReducer(
      stateOf({ contact: { full_name: '', phone_whatsapp: '', topic_description: '' } }),
      { type: 'fieldValidated', field: 'full_name' }
    );

    expect(failing.fieldErrors.full_name).toBe(contactFieldError('full_name', ''));

    const passing = bookingFlowReducer(
      { ...failing, contact: { ...failing.contact, full_name: 'اسم صحيح' } },
      { type: 'fieldValidated', field: 'full_name' }
    );

    expect(passing.fieldErrors.full_name).toBeUndefined();
  });
});

describe('steps', () => {
  it('advances one step and clamps on the last one', () => {
    const first = bookingFlowReducer(stateOf(), { type: 'stepAdvanced' });
    expect(first.stepIndex).toBe(1);
    expect(stepAt(first.stepIndex)).toBe('slots');

    const second = bookingFlowReducer(first, { type: 'stepAdvanced' });
    const third = bookingFlowReducer(second, { type: 'stepAdvanced' });

    expect(second.stepIndex).toBe(2);
    expect(third.stepIndex).toBe(2);
  });

  it('orders the chosen slots chronologically when leaving the details step', () => {
    const state = bookingFlowReducer(
      stateOf({ stepIndex: 2, slots: [LATE, EARLY], selectedSlotIds: ['s-late', 's-early'] }),
      { type: 'stepAdvanced' }
    );

    expect(state.selectedSlotIds).toEqual(['s-early', 's-late']);
    expect(state.stepIndex).toBe(2);
  });

  it('goes back one step and never below the first', () => {
    expect(bookingFlowReducer(stateOf({ stepIndex: 2 }), { type: 'stepBacked' }).stepIndex).toBe(1);
    expect(bookingFlowReducer(stateOf(), { type: 'stepBacked' }).stepIndex).toBe(0);
  });

  it('jumps to a reachable step only, and clears the error', () => {
    expect(
      bookingFlowReducer(stateOf({ stepIndex: 2, error: 'boom' }), { type: 'stepJumped', index: 1 })
    ).toMatchObject({ stepIndex: 1, error: null });

    expect(
      bookingFlowReducer(stateOf({ stepIndex: 2 }), { type: 'stepJumped', index: 2 }).stepIndex
    ).toBe(2);
    expect(bookingFlowReducer(stateOf(), { type: 'stepJumped', index: -1 }).stepIndex).toBe(0);
  });
});

describe('submission', () => {
  it('clears the previous errors when the submit starts', () => {
    const state = bookingFlowReducer(stateOf({ error: 'boom', fieldErrors: { a: 'b' } }), {
      type: 'bookingStarted',
    });

    expect(state).toMatchObject({ submitting: true, error: null, fieldErrors: {} });
  });

  it('refuses an offline submit without touching the request flag', () => {
    const state = bookingFlowReducer(stateOf(), {
      type: 'bookingRefused',
      message: OFFLINE_BOOKING,
    });

    expect(state.error).toBe(OFFLINE_BOOKING);
    expect(state.submitting).toBe(false);
  });

  it('stops submitting and shows the server errors on failure', () => {
    const state = bookingFlowReducer(stateOf({ submitting: true }), {
      type: 'bookingFailed',
      message: 'تعذر',
      fieldErrors: { full_name: 'مطلوب' },
    });

    expect(state).toMatchObject({
      submitting: false,
      error: 'تعذر',
      fieldErrors: { full_name: 'مطلوب' },
    });
  });

  it('stops submitting on success', () => {
    expect(
      bookingFlowReducer(stateOf({ submitting: true }), { type: 'bookingFinished' })
    ).toMatchObject({ submitting: false });
  });

  it('starts over without discarding the catalogue or the availability', () => {
    const state = bookingFlowReducer(
      stateOf({
        stepIndex: 2,
        packages: [PACKAGE],
        slots: [EARLY],
        selectedPackageId: 'pkg-1',
        selectedSlotIds: ['s-early'],
        contact: { full_name: 'اسم', phone_whatsapp: '1', topic_description: 'موضوع' },
        slotsError: SLOTS_UNAVAILABLE,
        error: 'boom',
        fieldErrors: { full_name: 'مطلوب' },
      }),
      { type: 'startedOver' }
    );

    expect(state).toMatchObject({
      stepIndex: 0,
      packages: [PACKAGE],
      slots: [EARLY],
      selectedPackageId: null,
      selectedSlotIds: [],
      slotsError: null,
      error: null,
      fieldErrors: {},
    });
    expect(state.contact.full_name).toBe('');
  });
});
