/**
 * One received voice note (ADR-0127): where its bytes are, whether they are
 * playing, how far, how long it is, the shape drawn from it, the speed the
 * member picked, and whether it could be read at all.
 *
 * The player wrote all seven from four places — the open, the decode, the audio
 * element's own events and the two controls — so they are one state, and the
 * element's callbacks are its transitions.
 */
export interface VoiceNotePlayerData {
  url: string | null;
  playing: boolean;
  progress: number;
  durationMs: number;
  peaks: number[];
  /** Index into the player's speed list, not the multiplier. */
  speed: number;
  failed: boolean;
}

export type VoiceNotePlayerAction =
  | { type: 'opened'; url: string }
  | { type: 'shapeDecoded'; peaks: number[]; durationMs: number }
  /** `loadedmetadata` on a clip the shape pass could not decode. */
  | { type: 'durationKnown'; durationMs: number }
  | { type: 'played' }
  | { type: 'paused' }
  | { type: 'progressed'; progress: number }
  | { type: 'ended' }
  | { type: 'speedAdvanced'; speed: number }
  | { type: 'failed' };

export function voiceNotePlayerInitialState(seed: {
  durationMs: number;
  peaks: number[];
}): VoiceNotePlayerData {
  return {
    url: null,
    playing: false,
    progress: 0,
    durationMs: seed.durationMs,
    peaks: seed.peaks,
    speed: 0,
    failed: false,
  };
}

export function voiceNotePlayerReducer(
  state: VoiceNotePlayerData,
  action: VoiceNotePlayerAction
): VoiceNotePlayerData {
  switch (action.type) {
    case 'opened':
      return { ...state, url: action.url };

    case 'shapeDecoded':
      return { ...state, peaks: action.peaks, durationMs: action.durationMs };

    case 'durationKnown':
      return { ...state, durationMs: action.durationMs };

    case 'played':
      return { ...state, playing: true };

    case 'paused':
      return { ...state, playing: false };

    case 'progressed':
      return { ...state, progress: action.progress };

    case 'ended':
      return { ...state, playing: false, progress: 0 };

    case 'speedAdvanced':
      return { ...state, speed: action.speed };

    case 'failed':
      return { ...state, failed: true };
  }
}
