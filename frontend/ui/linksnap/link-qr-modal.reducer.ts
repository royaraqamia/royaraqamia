/**
 * The QR dialog's generation: the SVG it painted, whether generation failed,
 * and the key the retry bumps to ask again.
 *
 * The effect wrote the error and the SVG together from one promise chain, and
 * the retry wrote the SVG, the error and the key at once — so they are one
 * state here.
 */
export interface LinkQrState {
  svg: string | null;
  error: boolean;
  generationKey: number;
}

export type LinkQrAction =
  | { type: 'generationStarted' }
  | { type: 'generated'; svg: string }
  | { type: 'generationFailed' }
  | { type: 'regenerationRequested' };

export function linkQrInitialState(): LinkQrState {
  return { svg: null, error: false, generationKey: 0 };
}

export function linkQrReducer(state: LinkQrState, action: LinkQrAction): LinkQrState {
  switch (action.type) {
    case 'generationStarted':
      return { ...state, error: false };

    case 'generated':
      return { ...state, svg: action.svg };

    case 'generationFailed':
      return { ...state, error: true };

    case 'regenerationRequested':
      return { svg: null, error: false, generationKey: state.generationKey + 1 };
  }
}
