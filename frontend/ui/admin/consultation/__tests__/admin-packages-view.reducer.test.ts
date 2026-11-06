import { describe, expect, it } from 'vitest';
import type { ConsultationPackage } from '@/shared/contracts/consultation';
import {
  EMPTY_PACKAGE_DRAFT,
  packagesInitialState,
  packagesReducer,
  packageDraftOf,
  type PackagesState,
} from '@/frontend/ui/admin/consultation/admin-packages-view.reducer';

const PACKAGE = {
  id: 'pkg-1',
  name: 'استشارة موسّعة',
  description: 'ثلاث جلسات',
  price_usd: 75,
  duration_minutes: 60,
  sessions_count: 3,
  is_active: false,
  sort_order: 2,
} as unknown as ConsultationPackage;

function stateOf(patch: Partial<PackagesState> = {}): PackagesState {
  return { ...packagesInitialState(), ...patch };
}

describe('packagesInitialState', () => {
  it('starts loading, with the form closed and an empty draft', () => {
    expect(packagesInitialState()).toEqual({
      packages: [],
      loading: true,
      editingId: null,
      draft: EMPTY_PACKAGE_DRAFT,
      showForm: false,
      saving: false,
      message: null,
    });
  });
});

describe('opening the form', () => {
  it('forgets the edited row, the draft and the message when creating', () => {
    const state = packagesReducer(
      stateOf({
        editingId: 'pkg-1',
        draft: packageDraftOf(PACKAGE),
        message: { ok: true, text: 'x' },
      }),
      { type: 'createStarted' }
    );

    expect(state).toMatchObject({ editingId: null, showForm: true, message: null });
    expect(state.draft).toEqual(EMPTY_PACKAGE_DRAFT);
  });

  it('drafts the row when editing', () => {
    const state = packagesReducer(stateOf({ message: { ok: false, text: 'x' } }), {
      type: 'editStarted',
      pkg: PACKAGE,
    });

    expect(state).toMatchObject({ editingId: 'pkg-1', showForm: true, message: null });
    expect(state.draft).toEqual({
      name: 'استشارة موسّعة',
      description: 'ثلاث جلسات',
      price_usd: '75',
      duration_minutes: '60',
      sessions_count: '3',
      is_active: false,
    });
  });

  it('leaves a missing description as an empty field', () => {
    const bare = { ...PACKAGE, description: null } as unknown as ConsultationPackage;

    expect(packageDraftOf(bare).description).toBe('');
  });

  it('keeps the draft when the form is dismissed', () => {
    const edited = packagesReducer(stateOf(), { type: 'editStarted', pkg: PACKAGE });
    const closed = packagesReducer(edited, { type: 'formClosed' });

    expect(closed.showForm).toBe(false);
    expect(closed.draft).toEqual(edited.draft);
  });
});

describe('saving', () => {
  it('merges one draft field at a time', () => {
    const state = packagesReducer(stateOf(), {
      type: 'draftChanged',
      patch: { price_usd: '90' },
    });

    expect(state.draft.price_usd).toBe('90');
    expect(state.draft.duration_minutes).toBe(EMPTY_PACKAGE_DRAFT.duration_minutes);
  });

  it('raises and lowers the saving flag', () => {
    const saving = packagesReducer(stateOf(), { type: 'saveStarted' });
    expect(saving.saving).toBe(true);
    expect(packagesReducer(saving, { type: 'saveFinished' }).saving).toBe(false);
  });

  it('closes the form and reports success in one transition', () => {
    const state = packagesReducer(stateOf({ showForm: true, saving: true }), {
      type: 'saveSucceeded',
      message: { ok: true, text: 'تم تحديث الباقة.' },
    });

    expect(state).toMatchObject({
      showForm: false,
      message: { ok: true, text: 'تم تحديث الباقة.' },
    });
  });

  it('keeps the form open and shows the failure', () => {
    const state = packagesReducer(stateOf({ showForm: true }), {
      type: 'messageSet',
      message: { ok: false, text: 'فشل الحفظ.' },
    });

    expect(state).toMatchObject({ showForm: true, message: { ok: false, text: 'فشل الحفظ.' } });
  });
});

describe('reading', () => {
  it('lands the list and lowers the flag', () => {
    expect(
      packagesReducer(stateOf({ loading: true }), { type: 'loaded', packages: [PACKAGE] })
    ).toMatchObject({ packages: [PACKAGE], loading: false });
  });
});
