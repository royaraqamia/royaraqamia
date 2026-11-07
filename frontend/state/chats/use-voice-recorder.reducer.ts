/** Bars kept for the live waveform. */
export const VOICE_LEVEL_BARS = 32;

/**
 * One capture, from the permission prompt to the WAV: the microphone running,
 * the timer and meter the bar draws while it does, the re-render that follows,
 * and the one sentence a refusal or a tap leaves behind.
 *
 * Five states moved together inside `start`/`finish` — a capture set three of
 * them in one burst, and a failed one wrote another pair — so they are one
 * state here, and the clock is passed in rather than read.
 */
export interface VoiceRecorderData {
  isRecording: boolean;
  isPreparing: boolean;
  elapsedMs: number;
  levels: number[];
  error: string | null;
}

export type VoiceRecorderAction =
  /** A new attempt: the last failure sentence is not this one's. */
  | { type: 'attempted' }
  | { type: 'captureStarted' }
  /** One meter tick; `level` is null on a device with no analyser. */
  | { type: 'ticked'; elapsedMs: number; level: number | null }
  | { type: 'prepareStarted' }
  | { type: 'captureStopped' }
  | { type: 'prepareFinished' }
  | { type: 'failed'; message: string };

export function voiceRecorderInitialState(): VoiceRecorderData {
  return {
    isRecording: false,
    isPreparing: false,
    elapsedMs: 0,
    levels: [],
    error: null,
  };
}

export function voiceRecorderReducer(
  state: VoiceRecorderData,
  action: VoiceRecorderAction
): VoiceRecorderData {
  switch (action.type) {
    case 'attempted':
      return { ...state, error: null };

    case 'captureStarted':
      return { ...state, isRecording: true, elapsedMs: 0, levels: [] };

    case 'ticked':
      return {
        ...state,
        elapsedMs: action.elapsedMs,
        levels:
          action.level === null
            ? state.levels
            : [...state.levels, action.level].slice(-VOICE_LEVEL_BARS),
      };

    case 'prepareStarted':
      return { ...state, isPreparing: true };

    case 'captureStopped':
      return { ...state, isRecording: false, elapsedMs: 0 };

    case 'prepareFinished':
      return { ...state, isPreparing: false };

    case 'failed':
      return { ...state, error: action.message };
  }
}
