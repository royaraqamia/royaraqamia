import type { SurahAudioState } from '@/frontend/shared/local-store/audio';

/**
 * The recitation's contract between the app and whichever engine is playing it.
 *
 * ADR-0085 promised the UI would not know the difference between the browser
 * and the shell; this is that promise written down. The web engine plays with an
 * `<audio>` element and the Media Session; the native one talks to the Android
 * service (ADR-0086). Both answer the same questions, and the float and mini
 * player are built only from these answers.
 */

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'offline';

export interface RecitationState {
  readonly status: PlayerStatus;
  readonly surah: number | null;
  readonly name: string | null;
  readonly ayahCount: number;
  /** The Ayah the queue is on, 1-based. */
  readonly ayah: number;
  /** Seconds into the current Ayah. */
  readonly position: number;
  /** The current Ayah's length, in seconds. */
  readonly duration: number;
  /** Seconds from the start of the sura. */
  readonly surahPosition: number;
  readonly surahDuration: number;
  /** Where the current Ayah came from; null before one has been chosen. */
  readonly source: 'device' | 'host' | null;
}

export const INITIAL_RECITATION_STATE: RecitationState = {
  status: 'idle',
  surah: null,
  name: null,
  ayahCount: 0,
  ayah: 1,
  position: 0,
  duration: 0,
  surahPosition: 0,
  surahDuration: 0,
  source: null,
};

export interface PlayOptions {
  readonly ayah?: number;
  readonly offset?: number;
}

export interface KeepProgress {
  readonly done: number;
  readonly total: number;
}

/** The keep's lifecycle, as the float paints it. */
export type KeepPhase = 'working' | 'done' | 'metered' | 'unsupported' | 'failed';

export interface KeepOutcome {
  /** What the device holds after the keep, when it can be read. */
  readonly saved: SurahAudioState | null;
  readonly phase: Exclude<KeepPhase, 'working'>;
}

export interface RecitationPlayer {
  subscribe(listener: () => void): () => void;
  getState(): RecitationState;
  getServerState(): RecitationState;
  /** Puts the browser's element in the document; a no-op in the shell. */
  mount(): void;
  /** Starts a sura (or resumes a restored one); `ayah` is 1-based. */
  play(surah: number, options?: PlayOptions): Promise<boolean>;
  toggle(): Promise<void>;
  stop(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  seekBy(seconds: number): void;
  /** What this device holds for a sura, or null when it cannot be read. */
  readSaved(surah: number, ayahCount: number): Promise<SurahAudioState | null>;
  /** Keeps a sura on the device, reporting progress as it goes. */
  keep(
    surah: number,
    ayahCount: number,
    onProgress: (progress: KeepProgress) => void
  ): Promise<KeepOutcome>;
  dispose(): void;
}
