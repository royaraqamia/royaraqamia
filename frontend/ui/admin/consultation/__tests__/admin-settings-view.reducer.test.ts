import { describe, expect, it } from 'vitest';

import {
  adminSettingsInitialState,
  adminSettingsReducer,
  type AdminSettingsState,
} from '@/frontend/ui/admin/consultation/admin-settings-view.reducer';

function stateOf(patch: Partial<AdminSettingsState> = {}): AdminSettingsState {
  return { ...adminSettingsInitialState(), ...patch };
}

describe('adminSettingsInitialState', () => {
  it('waits on the read with an empty draft and no line', () => {
    expect(adminSettingsInitialState()).toEqual({
      draft: {},
      loading: true,
      saving: false,
      message: null,
    });
  });
});

describe('the read', () => {
  it('fills the draft and finishes the read in one transition', () => {
    expect(
      adminSettingsReducer(stateOf(), {
        type: 'loaded',
        settings: { booking_whatsapp_url: 'https://wa.me/963' },
      })
    ).toMatchObject({
      draft: { booking_whatsapp_url: 'https://wa.me/963' },
      loading: false,
    });
  });
});

describe('editing', () => {
  it('writes the field and keeps the rest of the draft', () => {
    expect(
      adminSettingsReducer(stateOf({ draft: { booking_whatsapp_url: 'https://wa.me/1' } }), {
        type: 'fieldChanged',
        key: 'booking_whatsapp_url',
        value: 'https://wa.me/2',
      }).draft
    ).toEqual({ booking_whatsapp_url: 'https://wa.me/2' });
  });
});

describe('saving', () => {
  it('raises the flag and clears the previous line', () => {
    expect(
      adminSettingsReducer(stateOf({ message: { ok: false, text: 'فشل' } }), {
        type: 'saveStarted',
      })
    ).toMatchObject({ saving: true, message: null });
  });

  it('reports success and lowers the flag', () => {
    expect(adminSettingsReducer(stateOf({ saving: true }), { type: 'saveSucceeded' })).toEqual({
      draft: {},
      loading: true,
      saving: false,
      message: { ok: true, text: 'تم حفظ الإعدادات.' },
    });
  });

  it('reports the failure sentence and lowers the flag', () => {
    expect(
      adminSettingsReducer(stateOf({ saving: true }), {
        type: 'saveFailed',
        text: 'رابط واتساب غير صحيح',
      })
    ).toMatchObject({
      saving: false,
      message: { ok: false, text: 'رابط واتساب غير صحيح' },
    });
  });
});
