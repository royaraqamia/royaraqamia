import { describe, expect, it } from 'vitest';

import {
  VOICE_LEVEL_BARS,
  voiceRecorderInitialState,
  voiceRecorderReducer,
  type VoiceRecorderData,
} from '@/frontend/state/chats/use-voice-recorder.reducer';

function stateOf(patch: Partial<VoiceRecorderData> = {}): VoiceRecorderData {
  return { ...voiceRecorderInitialState(), ...patch };
}

describe('voiceRecorderInitialState', () => {
  it('starts idle, with no clock and no bars', () => {
    expect(voiceRecorderInitialState()).toEqual({
      isRecording: false,
      isPreparing: false,
      elapsedMs: 0,
      levels: [],
      error: null,
    });
  });
});

describe('starting a capture', () => {
  it('clears the last failure before the permission prompt', () => {
    const state = voiceRecorderReducer(stateOf({ error: 'سابق' }), { type: 'attempted' });

    expect(state.error).toBeNull();
  });

  it('opens the capture with a fresh clock and meter', () => {
    const state = voiceRecorderReducer(stateOf({ elapsedMs: 900, levels: [0.4], error: 'سابق' }), {
      type: 'captureStarted',
    });

    expect(state).toEqual({
      isRecording: true,
      isPreparing: false,
      elapsedMs: 0,
      levels: [],
      error: 'سابق',
    });
  });
});

describe('the meter', () => {
  it('moves the clock and appends the reading', () => {
    const state = voiceRecorderReducer(stateOf({ isRecording: true, levels: [0.2] }), {
      type: 'ticked',
      elapsedMs: 300,
      level: 0.5,
    });

    expect(state.elapsedMs).toBe(300);
    expect(state.levels).toEqual([0.2, 0.5]);
  });

  it('moves the clock without a bar on a device with no analyser', () => {
    const state = voiceRecorderReducer(stateOf({ isRecording: true, levels: [0.2] }), {
      type: 'ticked',
      elapsedMs: 300,
      level: null,
    });

    expect(state.elapsedMs).toBe(300);
    expect(state.levels).toEqual([0.2]);
  });

  it('keeps the last screenful of bars', () => {
    const full = Array.from({ length: VOICE_LEVEL_BARS }, (_, index) => index / 100);
    const state = voiceRecorderReducer(stateOf({ levels: full }), {
      type: 'ticked',
      elapsedMs: 100,
      level: 1,
    });

    expect(state.levels).toHaveLength(VOICE_LEVEL_BARS);
    expect(state.levels[0]).toBe(0.01);
    expect(state.levels.at(-1)).toBe(1);
  });
});

describe('finishing a capture', () => {
  it('marks the re-render while the microphone is still open', () => {
    const state = voiceRecorderReducer(stateOf({ isRecording: true }), {
      type: 'prepareStarted',
    });

    expect(state).toEqual({ ...stateOf({ isRecording: true }), isPreparing: true });
  });

  it('closes the capture and zeroes the clock before the re-render ends', () => {
    const state = voiceRecorderReducer(
      stateOf({ isRecording: true, isPreparing: true, elapsedMs: 2400 }),
      { type: 'captureStopped' }
    );

    expect(state.isRecording).toBe(false);
    expect(state.elapsedMs).toBe(0);
    expect(state.isPreparing).toBe(true);
  });

  it('drops the re-render flag once the clip is ready', () => {
    const state = voiceRecorderReducer(stateOf({ isPreparing: true }), {
      type: 'prepareFinished',
    });

    expect(state.isPreparing).toBe(false);
  });

  it('keeps the capture open when the stop could not be read', () => {
    const state = voiceRecorderReducer(
      stateOf({ isRecording: true, isPreparing: true, elapsedMs: 1200 }),
      { type: 'failed', message: 'تعذّر التسجيل.' }
    );

    expect(state).toEqual({
      isRecording: true,
      isPreparing: true,
      elapsedMs: 1200,
      levels: [],
      error: 'تعذّر التسجيل.',
    });
  });
});
