import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NativeRecitationPlayer,
  type NativeQuranPlugin,
  type NativeQuranStatePayload,
} from '@/frontend/shared/recitation/native-player';

const RESTORED: NativeQuranStatePayload = {
  status: 'paused',
  surah: 2,
  name: 'البقرة',
  ayahCount: 286,
  ayah: 14,
  position: 3,
  duration: 0,
  surahPosition: 3,
  surahDuration: 0,
  source: null,
  loaded: false,
};

const PLAYING: NativeQuranStatePayload = {
  status: 'playing',
  surah: 2,
  name: 'البقرة',
  ayahCount: 286,
  ayah: 14,
  position: 12.5,
  duration: 30,
  surahPosition: 412,
  surahDuration: 9000,
  source: 'host',
  loaded: true,
};

class FakePlugin implements NativeQuranPlugin {
  payload: NativeQuranStatePayload = RESTORED;
  savedState: string = 'complete';
  keepPhases: string[] = ['done'];
  readonly calls: string[] = [];
  private listener: ((payload: NativeQuranStatePayload) => void) | null = null;
  removed = false;

  addListener(
    _event: 'state',
    listener: (payload: NativeQuranStatePayload) => void
  ): { remove: () => void } {
    this.listener = listener;
    return {
      remove: () => {
        this.removed = true;
        this.listener = null;
      },
    };
  }

  emit(payload: NativeQuranStatePayload): void {
    this.payload = payload;
    this.listener?.(payload);
  }

  async state(): Promise<NativeQuranStatePayload> {
    return this.payload;
  }

  async loadSurah(options: { surah: number; ayah: number; offset: number; origin: string }) {
    this.calls.push(`load:${options.surah}:${options.ayah}:${options.offset}:${options.origin}`);
  }

  async play(): Promise<void> {
    this.calls.push('play');
  }

  async pause(): Promise<void> {
    this.calls.push('pause');
  }

  async next(): Promise<void> {
    this.calls.push('next');
  }

  async previous(): Promise<void> {
    this.calls.push('previous');
  }

  async seekTo(options: { seconds: number }): Promise<void> {
    this.calls.push(`seekTo:${options.seconds}`);
  }

  async seekBy(options: { seconds: number }): Promise<void> {
    this.calls.push(`seekBy:${options.seconds}`);
  }

  async stop(): Promise<void> {
    this.calls.push('stop');
  }

  async saved(): Promise<{ state: string }> {
    return { state: this.savedState };
  }

  async keep(): Promise<void> {
    this.calls.push('keep');
  }

  async keepState(): Promise<{ phase: string; done: number; total: number }> {
    const phase = this.keepPhases.shift() ?? 'done';
    return { phase, done: 3, total: 7 };
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the shell player', () => {
  it('restores the native position paused, then reports the live state', async () => {
    const plugin = new FakePlugin();
    const player = new NativeRecitationPlayer(plugin);

    await vi.waitFor(() => expect(player.getState()).toMatchObject({ surah: 2, ayah: 14 }));

    plugin.emit(PLAYING);
    expect(player.getState()).toMatchObject({
      status: 'playing',
      ayah: 14,
      position: 12.5,
      surahPosition: 412,
      source: 'host',
    });

    player.dispose();
    await vi.waitFor(() => expect(plugin.removed).toBe(true));
  });

  it('sends the restored Ayah a second and a half back, to the native service', async () => {
    const plugin = new FakePlugin();
    const player = new NativeRecitationPlayer(plugin);
    await vi.waitFor(() => expect(player.getState().surah).toBe(2));

    const started = await player.play(2);

    expect(started).toBe(true);
    expect(plugin.calls).toContain(`load:2:14:1.5:${window.location.origin}`);
    expect(player.getState().status).toBe('loading');
    player.dispose();
  });

  it('pauses a playing native player and resumes one that has media items', async () => {
    const plugin = new FakePlugin();
    const player = new NativeRecitationPlayer(plugin);
    await vi.waitFor(() => expect(player.getState().surah).toBe(2));

    plugin.emit(PLAYING);
    await player.toggle();
    expect(plugin.calls).toContain('pause');

    plugin.emit({ ...PLAYING, status: 'paused', loaded: true });
    await player.toggle();
    expect(plugin.calls).toContain('play');
    player.dispose();
  });

  it('reads what the shell holds, and polls a keep to its end', async () => {
    const plugin = new FakePlugin();
    plugin.keepPhases = ['working', 'done'];
    const player = new NativeRecitationPlayer(plugin);
    await vi.waitFor(() => expect(player.getState().surah).toBe(2));

    expect(await player.readSaved(2, 286)).toBe('complete');

    vi.useFakeTimers();
    const progress: number[] = [];
    const running = player.keep(2, 286, (value) => progress.push(value.done));
    await vi.advanceTimersByTimeAsync(1100);
    await expect(running).resolves.toEqual({ saved: 'complete', phase: 'done' });
    expect(plugin.calls).toContain('keep');
    expect(progress).toEqual([3]);

    player.dispose();
  });
});
