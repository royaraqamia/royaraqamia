/**
 * The tafsir provider's state: which Ayah's panel is open and the sura's file
 * once it arrives. The fetch wrote the file, its busy flag and its failure
 * together, and opening the panel wrote the Ayah, so the provider is one state
 * here.
 */
export interface TafsirState {
  openAyah: number | null;
  /** The Ayah text by number, or null until the sura's file has arrived. */
  bodies: Record<number, string | null> | null;
  loading: boolean;
  failed: boolean;
}

export type TafsirAction =
  | { type: 'opened'; ayah: number | null }
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; bodies: Record<number, string | null> }
  | { type: 'loadFailed' };

export const INITIAL_TAFSIR_STATE: TafsirState = {
  openAyah: null,
  bodies: null,
  loading: false,
  failed: false,
};

export function tafsirReducer(state: TafsirState, action: TafsirAction): TafsirState {
  switch (action.type) {
    case 'opened':
      return state.openAyah === action.ayah ? state : { ...state, openAyah: action.ayah };

    case 'loadStarted':
      return { ...state, loading: true, failed: false };

    case 'loadSucceeded':
      return { ...state, bodies: action.bodies, loading: false };

    case 'loadFailed':
      return { ...state, failed: true, loading: false };
  }
}
