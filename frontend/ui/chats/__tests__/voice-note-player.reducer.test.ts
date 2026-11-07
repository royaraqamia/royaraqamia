import { describe, expect, it } from 'vitest';

import {
  voiceNotePlayerInitialState,
  voiceNotePlayerReducer,
  type VoiceNotePlayerData,
} from '@/frontend/ui/chats/voice-note-player.reducer';

function stateOf(patch: Partial<VoiceNotePlayerData> = {}): VoiceNotePlayerData {
  return { ...voiceNotePlayerInitialState({ durationMs: 0, peaks: [] }), ...patch };
}

describe('voiceNotePlayerInitialState', () => {
  it('starts closed, paused and unread, with the clip size as its length', () => {
    expect(voiceNotePlayerInitialState({ durationMs: 7300, peaks: [0.2, 1] })).toEqual({
      url: null,
      playing: false,
      progress: 0,
      durationMs: 7300,
      peaks: [0.2, 1],
      speed: 0,
      failed: false,
    });
  });
});

describe('opening a clip', () => {
  it('keeps the source once it has been minted', () => {
    const state = voiceNotePlayerReducer(stateOf(), { type: 'opened', url: 'blob:note' });

    expect(state.url).toBe('blob:note');
  });

  it('falls back to the download when the bytes cannot be found', () => {
    const state = voiceNotePlayerReducer(stateOf(), { type: 'failed' });

    expect(state.failed).toBe(true);
  });

  it('draws the shape and takes its real length from the decode', () => {
    const state = voiceNotePlayerReducer(stateOf({ durationMs: 6000 }), {
      type: 'shapeDecoded',
      peaks: [0.1, 0.9],
      durationMs: 6120,
    });

    expect(state.peaks).toEqual([0.1, 0.9]);
    expect(state.durationMs).toBe(6120);
  });

  it('takes the length from the element when the shape pass could not', () => {
    const state = voiceNotePlayerReducer(stateOf({ durationMs: 6000 }), {
      type: 'durationKnown',
      durationMs: 5900,
    });

    expect(state.durationMs).toBe(5900);
    expect(state.peaks).toEqual([]);
  });
});

describe('playing', () => {
  it('follows the element, not the press', () => {
    const playing = voiceNotePlayerReducer(stateOf(), { type: 'played' });
    expect(playing.playing).toBe(true);

    const paused = voiceNotePlayerReducer(playing, { type: 'paused' });
    expect(paused.playing).toBe(false);
  });

  it('moves the playhead', () => {
    const state = voiceNotePlayerReducer(stateOf(), { type: 'progressed', progress: 0.4 });

    expect(state.progress).toBe(0.4);
  });

  it('rewinds when the clip ends', () => {
    const state = voiceNotePlayerReducer(stateOf({ playing: true, progress: 0.98 }), {
      type: 'ended',
    });

    expect(state.playing).toBe(false);
    expect(state.progress).toBe(0);
  });
});

describe('the controls', () => {
  it('advances through the speed list without touching the playhead', () => {
    const state = voiceNotePlayerReducer(stateOf({ playing: true, progress: 0.3 }), {
      type: 'speedAdvanced',
      speed: 1,
    });

    expect(state.speed).toBe(1);
    expect(state.playing).toBe(true);
    expect(state.progress).toBe(0.3);
  });
});
