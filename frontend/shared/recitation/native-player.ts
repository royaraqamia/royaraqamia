import { isNativeApp, nativePlugin } from '@/frontend/shared/native-shell';
import type { SurahAudioState } from '@/frontend/shared/local-store/audio';
import {
  INITIAL_RECITATION_STATE,
  type KeepOutcome,
  type KeepPhase,
  type KeepProgress,
  type PlayOptions,
  type PlayerStatus,
  type RecitationPlayer,
  type RecitationState,
} from './state';

/**
 * The shell's engine (ADR-0086): a thin translation of the same contract the web
 * engine answers, over the Capacitor plugin that talks to the media3 service.
 *
 * It deliberately holds no queue, no element and no Media Session of its own.
 * Android owns all three while the screen is off; this class is the page's
 * half — send commands, receive state, and resync when a frozen WebView comes
 * back and has missed events.
 */

export interface NativeQuranStatePayload {
  readonly status: string;
  readonly surah: number | null;
  readonly name: string | null;
  readonly ayahCount: number;
  readonly ayah: number;
  readonly position: number;
  readonly duration: number;
  readonly surahPosition: number;
  readonly surahDuration: number;
  readonly source: 'device' | 'host' | null;
  readonly loaded: boolean;
}

interface NativeListenerHandle {
  remove?: () => unknown;
}

export interface NativeQuranPlugin {
  loadSurah(options: {
    surah: number;
    ayah: number;
    offset: number;
    origin: string;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(options: { seconds: number }): Promise<void>;
  seekBy(options: { seconds: number }): Promise<void>;
  stop(): Promise<void>;
  state(): Promise<NativeQuranStatePayload>;
  saved(options: { surah: number; ayahCount: number }): Promise<{ state: string }>;
  keep(options: { surah: number; origin: string }): Promise<void>;
  keepState(options: { surah: number }): Promise<{
    phase: string;
    done: number;
    total: number;
  }>;
  addListener(
    event: 'state',
    listener: (payload: NativeQuranStatePayload) => void
  ): NativeListenerHandle | Promise<NativeListenerHandle>;
}

const STATUSES: ReadonlySet<string> = new Set<PlayerStatus>([
  'idle',
  'loading',
  'playing',
  'paused',
  'error',
  'offline',
]);

const KEEP_POLL_MS = 1000;
const KEEP_GIVE_UP_MS = 10 * 60 * 1000;

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function savedState(value: unknown): SurahAudioState | null {
  return value === 'none' || value === 'partial' || value === 'complete' ? value : null;
}

export function createNativeRecitationPlayer(): RecitationPlayer | null {
  if (!isNativeApp()) return null;
  const plugin = nativePlugin<NativeQuranPlugin>('QuranPlayer');
  if (!plugin) return null;
  return new NativeRecitationPlayer(plugin);
}

export class NativeRecitationPlayer implements RecitationPlayer {
  private state: RecitationState = INITIAL_RECITATION_STATE;
  private readonly listeners = new Set<() => void>();
  private handle: NativeListenerHandle | null = null;
  private disposed = false;
  /** True when the native player has media items, not merely a saved position. */
  private loaded = false;

  constructor(private readonly plugin: NativeQuranPlugin) {
    const handle = this.plugin.addListener('state', (payload) => this.apply(payload));
    void Promise.resolve(handle)
      .then((value) => {
        this.handle = value;
      })
      .catch(() => {
        // A listener that could not be registered still leaves `state()` as the
        // resync path; playback itself is native and unaffected.
      });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', this.onPageShow);
    }

    void this.sync();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): RecitationState => this.state;

  readonly getServerState = (): RecitationState => INITIAL_RECITATION_STATE;

  mount(): void {
    // Android's element is the service's; the page has nothing to mount.
  }

  async play(surah: number, options: PlayOptions = {}): Promise<boolean> {
    const current = this.state;
    const sameSurah = current.surah === surah && current.ayahCount > 0;
    const ayah = options.ayah ?? (sameSurah ? current.ayah : 1);
    const offset =
      options.offset ??
      (sameSurah && current.position > 0 ? Math.max(current.position - 1.5, 0) : 0);

    this.set({ ...current, status: 'loading', surah, ayah, position: offset });

    try {
      await this.plugin.loadSurah({ surah, ayah, offset, origin: this.origin() });
      return true;
    } catch {
      this.set({ ...this.state, status: 'offline', source: null });
      return false;
    }
  }

  async toggle(): Promise<void> {
    if (this.state.status === 'loading') return;
    if (this.state.status === 'playing') {
      await this.plugin.pause();
      return;
    }
    if (this.loaded) {
      await this.plugin.play();
      return;
    }
    await this.play(this.state.surah ?? 1);
  }

  stop(): void {
    this.loaded = false;
    this.set(INITIAL_RECITATION_STATE);
    void this.plugin.stop().catch(() => {
      // A service that already stopped is a stop that succeeded.
    });
  }

  next(): void {
    void this.plugin.next().catch(() => {});
  }

  previous(): void {
    void this.plugin.previous().catch(() => {});
  }

  seek(seconds: number): void {
    void this.plugin.seekTo({ seconds }).catch(() => {});
  }

  seekBy(seconds: number): void {
    void this.plugin.seekBy({ seconds }).catch(() => {});
  }

  async readSaved(surah: number, ayahCount: number): Promise<SurahAudioState | null> {
    try {
      const result = await this.plugin.saved({ surah, ayahCount });
      return savedState(result.state);
    } catch {
      return null;
    }
  }

  async keep(
    surah: number,
    ayahCount: number,
    onProgress: (progress: KeepProgress) => void
  ): Promise<KeepOutcome> {
    try {
      await this.plugin.keep({ surah, origin: this.origin() });
    } catch {
      return { saved: await this.readSaved(surah, ayahCount), phase: 'failed' };
    }

    const started = Date.now();
    while (!this.disposed && Date.now() - started < KEEP_GIVE_UP_MS) {
      let phase: string;
      try {
        const state = await this.plugin.keepState({ surah });
        phase = state.phase;
        if (phase === 'working' && state.total > 0) {
          onProgress({ done: state.done, total: state.total });
        }
      } catch {
        return { saved: await this.readSaved(surah, ayahCount), phase: 'failed' };
      }

      if (phase !== 'working') {
        return {
          saved: await this.readSaved(surah, ayahCount),
          phase: keepPhase(phase),
        };
      }
      await delay(KEEP_POLL_MS);
    }

    return { saved: await this.readSaved(surah, ayahCount), phase: 'failed' };
  }

  dispose(): void {
    this.disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this.onPageShow);
    }
    void Promise.resolve(this.handle)
      .then((handle) => handle?.remove?.())
      .catch(() => {});
    this.handle = null;
    this.listeners.clear();
  }

  /** Reads the live native state; the resync after a frozen WebView. */
  private async sync(): Promise<void> {
    try {
      this.apply(await this.plugin.state());
    } catch {
      // Keep the last state; the next event or sync will correct it.
    }
  }

  private apply(payload: NativeQuranStatePayload): void {
    const status: PlayerStatus = STATUSES.has(payload.status)
      ? (payload.status as PlayerStatus)
      : 'idle';
    this.loaded = payload.loaded === true;

    this.set({
      status,
      surah: typeof payload.surah === 'number' ? payload.surah : null,
      name: typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : null,
      ayahCount: Math.max(number(payload.ayahCount, 0), 0),
      ayah: Math.max(number(payload.ayah, 1), 1),
      position: Math.max(number(payload.position, 0), 0),
      duration: Math.max(number(payload.duration, 0), 0),
      surahPosition: Math.max(number(payload.surahPosition, 0), 0),
      surahDuration: Math.max(number(payload.surahDuration, 0), 0),
      source: payload.source === 'device' || payload.source === 'host' ? payload.source : null,
    });
  }

  private set(next: RecitationState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private origin(): string {
    return typeof window !== 'undefined' ? window.location.origin : 'https://royaraqamia.com';
  }

  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.sync();
    }
  };

  private readonly onPageShow = (): void => {
    void this.sync();
  };
}

function keepPhase(phase: string): Exclude<KeepPhase, 'working'> {
  if (phase === 'done' || phase === 'metered' || phase === 'unsupported') return phase;
  // `idle` is the service saying it has no keep for this sura — the next play
  // press retries. Anything unknown is equally a failed keep, not a crash.
  return 'failed';
}
