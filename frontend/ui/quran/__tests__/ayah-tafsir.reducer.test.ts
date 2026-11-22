import { describe, expect, it } from 'vitest';
import { INITIAL_TAFSIR_STATE, tafsirReducer } from '@/frontend/ui/quran/ayah-tafsir.reducer';

describe('tafsirReducer', () => {
  it('starts with nothing open and no file', () => {
    expect(INITIAL_TAFSIR_STATE).toEqual({
      openAyah: null,
      bodies: null,
      loading: false,
      failed: false,
    });
  });

  it('opens and closes the panel', () => {
    const opened = tafsirReducer(INITIAL_TAFSIR_STATE, { type: 'opened', ayah: 7 });
    expect(opened.openAyah).toBe(7);

    expect(tafsirReducer(opened, { type: 'opened', ayah: null }).openAyah).toBeNull();
  });

  it('leaves an already-open panel alone', () => {
    const opened = tafsirReducer(INITIAL_TAFSIR_STATE, { type: 'opened', ayah: 7 });
    expect(tafsirReducer(opened, { type: 'opened', ayah: 7 })).toBe(opened);
  });

  it('raises the spinner and clears a previous failure when the file loads', () => {
    const failed = tafsirReducer(INITIAL_TAFSIR_STATE, { type: 'loadFailed' });
    const started = tafsirReducer(failed, { type: 'loadStarted' });

    expect(started.loading).toBe(true);
    expect(started.failed).toBe(false);
  });

  it('settles the bodies and the spinner together', () => {
    const started = tafsirReducer(INITIAL_TAFSIR_STATE, { type: 'loadStarted' });
    const state = tafsirReducer(started, {
      type: 'loadSucceeded',
      bodies: { 1: 'نص', 2: null },
    });

    expect(state.bodies).toEqual({ 1: 'نص', 2: null });
    expect(state.loading).toBe(false);
    expect(state.failed).toBe(false);
  });

  it('names a failed load and stops loading', () => {
    const started = tafsirReducer(INITIAL_TAFSIR_STATE, { type: 'loadStarted' });
    const state = tafsirReducer(started, { type: 'loadFailed' });

    expect(state.failed).toBe(true);
    expect(state.loading).toBe(false);
  });
});
