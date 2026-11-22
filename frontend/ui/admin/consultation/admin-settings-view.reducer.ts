import type { ConsultationSettings } from '@/shared/contracts/consultation';

export type SettingsDraft = Partial<ConsultationSettings>;

export interface SettingsMessage {
  ok: boolean;
  text: string;
}

/**
 * The consultation settings form: the draft it edits, the read that fills it,
 * the save in flight and the line below the field.
 *
 * The read wrote the draft and finished the load together, and a save wrote
 * its flag and its line together — so they are one state here.
 */
export interface AdminSettingsState {
  draft: SettingsDraft;
  loading: boolean;
  saving: boolean;
  message: SettingsMessage | null;
}

export type AdminSettingsAction =
  | { type: 'loaded'; settings: SettingsDraft }
  | { type: 'fieldChanged'; key: keyof ConsultationSettings; value: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; text: string };

export function adminSettingsInitialState(): AdminSettingsState {
  return { draft: {}, loading: true, saving: false, message: null };
}

export function adminSettingsReducer(
  state: AdminSettingsState,
  action: AdminSettingsAction
): AdminSettingsState {
  switch (action.type) {
    case 'loaded':
      return { ...state, draft: action.settings, loading: false };

    case 'fieldChanged':
      return { ...state, draft: { ...state.draft, [action.key]: action.value } };

    case 'saveStarted':
      return { ...state, saving: true, message: null };

    case 'saveSucceeded':
      return { ...state, saving: false, message: { ok: true, text: 'تم حفظ الإعدادات.' } };

    case 'saveFailed':
      return { ...state, saving: false, message: { ok: false, text: action.text } };
  }
}
