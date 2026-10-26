import {
  audioPlaybackSource,
  downloadSurahAudio,
  loadAudioEdition,
  loadPlayableSurah,
  readDownloadedSurah,
  SurahAudioDownloadError,
  type AudioPlaybackSource,
  type PlayableSurah,
} from '@/frontend/api/quran/audio';
import { logRecitationFailure } from './log';
import type { SurahAudioState } from '@/frontend/shared/local-store/audio';
import type { QuranAudioEdition, QuranAudioFile } from '@/shared/contracts/quran-audio';
import {
  createRecitationMediaSession,
  type RecitationMediaSession,
  type RecitationTrack,
} from './media-session';
import {
  browserStorage,
  clearStoredRecitation,
  readStoredRecitation,
  writeStoredRecitation,
  type StorageLike,
} from './storage';
import {
  INITIAL_RECITATION_STATE,
  type KeepOutcome,
  type KeepProgress,
  type PlayOptions,
  type RecitationPlayer,
  type RecitationState,
} from './state';
import { buildTimeline, positionAt, startOf, withAyahSeconds, type Timeline } from './timeline';

/**
 * The recitation, owned by the document rather than by the page that started it.
 *
 * One element, one queue, one Media Session. Navigating the app does not touch
 * it, and the next Ayah is fetched while the current one is still sounding, so
 * the queue does not wait on the main thread or on a cold network at the exact
 * moment the file ends. When the last Ayah of a sura ends, the next sura is
 * appended and the recitation continues (ADR-0085).
 *
 * This is the browser engine. The native shell has its own engine behind the
 * same interface (PR 2), because a WebView cannot keep a JS queue alive with the
 * screen off.
 */

interface Playlist {
  readonly surah: number;
  readonly name: string;
  readonly baseUrl: string;
  readonly files: readonly QuranAudioFile[];
  timeline: Timeline;
}

export interface RecitationEngineDeps {
  readonly createAudio?: () => HTMLAudioElement;
  /** `null` disables the system controls; `undefined` asks the browser. */
  readonly mediaSession?: RecitationMediaSession | null;
  readonly loadPlayable?: (surah: number) => Promise<PlayableSurah | null>;
  readonly loadEdition?: () => Promise<QuranAudioEdition>;
  readonly playbackSource?: (
    baseUrl: string,
    surah: number,
    file: QuranAudioFile
  ) => Promise<AudioPlaybackSource>;
  readonly storage?: StorageLike | null;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  /** Prefetch the next Ayah to a blob. Off only in tests that do not want a network. */
  readonly prefetch?: boolean;
}

/** How far back a restored Ayah starts, so the first word is not clipped. */
const RESTORE_REWIND_SECONDS = 1.5;
const SEEK_ACK_SECONDS = 3;
const PERSIST_INTERVAL_MS = 5000;
const UI_INTERVAL_MS = 1000;
const MAX_RETRIES = 2;
const LAST_SURAH = 114;

function sameState(a: RecitationState, b: RecitationState): boolean {
  return (
    a.status === b.status &&
    a.surah === b.surah &&
    a.name === b.name &&
    a.ayahCount === b.ayahCount &&
    a.ayah === b.ayah &&
    a.position === b.position &&
    a.duration === b.duration &&
    a.surahPosition === b.surahPosition &&
    a.surahDuration === b.surahDuration &&
    a.source === b.source
  );
}

export class RecitationEngine implements RecitationPlayer {
  private readonly audio: HTMLAudioElement;
  private readonly session: RecitationMediaSession | null;
  private readonly loadPlayable: (surah: number) => Promise<PlayableSurah | null>;
  private readonly loadEdition: () => Promise<QuranAudioEdition>;
  private readonly playbackSource: (
    baseUrl: string,
    surah: number,
    file: QuranAudioFile
  ) => Promise<AudioPlaybackSource>;
  private readonly storage: StorageLike | null;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly prefetchEnabled: boolean;

  private state: RecitationState = INITIAL_RECITATION_STATE;
  private readonly listeners = new Set<() => void>();

  private playlist: Playlist | null = null;
  private index = 0;
  private bitrateKbps = 64;
  private reciter = '';

  private nextPlaylist: Playlist | null = null;
  private nextFor: number | null = null;
  private nextPromise: Promise<Playlist | null> | null = null;

  private requestId = 0;
  private pendingOffset: number | null = null;
  private currentBlobUrl: string | null = null;
  private readonly prefetched = new Map<string, string>();
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastUiAt = 0;
  private lastPersistAt = 0;

  constructor(deps: RecitationEngineDeps = {}) {
    this.audio = deps.createAudio?.() ?? new Audio();
    this.audio.preload = 'auto';
    this.session =
      deps.mediaSession === undefined ? createRecitationMediaSession() : deps.mediaSession;
    this.loadPlayable = deps.loadPlayable ?? loadPlayableSurah;
    this.loadEdition = deps.loadEdition ?? loadAudioEdition;
    this.playbackSource = deps.playbackSource ?? audioPlaybackSource;
    this.storage = deps.storage === undefined ? browserStorage() : deps.storage;
    this.fetcher = deps.fetcher ?? ((input, init) => fetch(input, init));
    this.now = deps.now ?? Date.now;
    this.prefetchEnabled = deps.prefetch ?? true;

    this.session?.bind({
      play: () => void this.startPlayback(),
      pause: () => this.pause(),
      stop: () => this.stop(),
      previous: () => this.previous(),
      next: () => this.next(),
      seekTo: (seconds) => this.seek(seconds),
      seekBy: (seconds) => this.seekBy(seconds),
    });

    this.audio.addEventListener('ended', this.onEnded);
    this.audio.addEventListener('timeupdate', this.onTimeUpdate);
    this.audio.addEventListener('loadedmetadata', this.onLoadedMetadata);
    this.audio.addEventListener('durationchange', this.onLoadedMetadata);
    this.audio.addEventListener('playing', this.onPlaying);
    this.audio.addEventListener('pause', this.onPause);
    this.audio.addEventListener('error', this.onError);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
    }

    this.restore();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): RecitationState => this.state;

  /** Hydration must start from the same state the server rendered (ADR-0042's shape). */
  readonly getServerState = (): RecitationState => INITIAL_RECITATION_STATE;

  /**
   * Puts the element in the document, once, after hydration.
   *
   * It has to outlive every page, so React must not own it: a route change that
   * unmounted the element would take the sound with it. Tests and the browser
   * both find it as `[data-quran-audio]`.
   */
  mount(): void {
    if (typeof document === 'undefined' || this.disposed) return;
    if (this.audio.isConnected) return;
    this.audio.setAttribute('data-quran-audio', '');
    this.audio.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.audio);
  }

  /**
   * Starts a sura, or resumes the one this engine already holds.
   *
   * `ayah` is 1-based. With neither option, a restored position is resumed a
   * second and a half back so the first word is not clipped.
   */
  async play(surah: number = this.state.surah ?? 1, options: PlayOptions = {}): Promise<boolean> {
    if (this.disposed) return false;
    this.retries = 0;

    // Already holding this sura's file: play it from where it stopped rather
    // than re-resolving the Ayah and starting it over.
    if (
      options.ayah === undefined &&
      this.playlist?.surah === surah &&
      this.audio.getAttribute('src')
    ) {
      await this.resume();
      return true;
    }

    // A restored position is read before the queue is adopted, which resets the
    // Ayah to the sura's first.
    const restoring = this.state.surah === surah && !this.audio.getAttribute('src');
    const restoreAyah = this.state.ayah;
    const restoreOffset = this.state.position;

    if (!this.playlist || this.playlist.surah !== surah) {
      const prepared = await this.loadPlaylist(surah);
      if (!prepared) {
        this.setState({ status: 'offline', surah, source: null });
        return false;
      }
      this.adopt(prepared);
      this.prefetchNextSurah(surah + 1);
    }

    const playlist = this.playlist;
    if (!playlist) return false;
    const count = playlist.files.length;

    let index = 0;
    let offset = 0;

    if (options.ayah !== undefined) {
      index = Math.min(Math.max(options.ayah - 1, 0), Math.max(count - 1, 0));
      offset = Math.max(options.offset ?? 0, 0);
    } else if (restoring && restoreAyah >= 1 && restoreAyah <= count) {
      index = restoreAyah - 1;
      offset = Math.max(restoreOffset - RESTORE_REWIND_SECONDS, 0);
    }

    return this.playAt(index, offset);
  }

  async toggle(): Promise<void> {
    if (this.state.status === 'loading') return;
    if (this.state.status === 'playing') {
      this.pause();
      return;
    }
    if (this.audio.getAttribute('src')) {
      await this.resume();
      return;
    }
    await this.play(this.state.surah ?? 1);
  }

  /**
   * The system's play action: play, never toggle. A media key that is already
   * playing must not pause the recitation.
   */
  async startPlayback(): Promise<void> {
    if (this.state.status === 'playing' || this.state.status === 'loading') return;
    if (this.audio.getAttribute('src')) {
      await this.resume();
      return;
    }
    await this.play(this.state.surah ?? 1);
  }

  pause(): void {
    this.audio.pause();
    if (this.state.status === 'playing' || this.state.status === 'loading') {
      this.setState({ status: 'paused' });
      this.session?.playback('paused');
      this.persist();
    }
  }

  async resume(): Promise<void> {
    if (!this.audio.getAttribute('src')) {
      await this.play(this.state.surah ?? 1);
      return;
    }
    this.retries = 0;
    try {
      await this.audio.play();
    } catch {
      this.setState({ status: this.state.source === 'device' ? 'error' : 'offline' });
      this.session?.playback('paused');
      this.retry();
    }
  }

  stop(): void {
    this.requestId += 1;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retries = 0;

    this.audio.pause();
    this.audio.removeAttribute('src');
    try {
      this.audio.load();
    } catch {
      // A load that refuses an empty source has already done what stop asks.
    }

    this.playlist = null;
    this.nextPlaylist = null;
    this.nextFor = null;
    this.nextPromise = null;
    this.index = 0;
    this.pendingOffset = null;
    this.releaseBlob();
    this.releasePrefetched();

    this.setState(INITIAL_RECITATION_STATE);
    this.session?.clear();
    clearStoredRecitation(this.storage);
  }

  next(): void {
    const playlist = this.playlist;
    if (!playlist) return;
    if (this.index + 1 < playlist.files.length) {
      void this.playAt(this.index + 1);
      return;
    }
    void this.playNextSurah();
  }

  previous(): void {
    if (!this.playlist) return;
    if (this.audioSafeTime() > SEEK_ACK_SECONDS) {
      this.seekWithin(0);
      return;
    }
    if (this.index > 0) {
      void this.playAt(this.index - 1);
      return;
    }
    this.seekWithin(0);
  }

  /** Seeks to a time on the sura's timeline, switching Ayah when it has to. */
  seek(seconds: number): void {
    const playlist = this.playlist;
    if (!playlist) return;

    const { index, offset } = positionAt(playlist.timeline, seconds);
    if (index === this.index) {
      this.seekWithin(offset);
      return;
    }
    void this.playAt(index, offset);
  }

  /** Seeks inside the current Ayah, for the system's ten-second buttons. */
  seekBy(delta: number): void {
    this.seekWithin(this.audioSafeTime() + delta);
  }

  /** What this device holds for a sura, or null when it cannot be read. */
  async readSaved(surah: number, ayahCount: number): Promise<SurahAudioState | null> {
    try {
      return await readDownloadedSurah(surah, ayahCount);
    } catch {
      return null;
    }
  }

  /**
   * Keeps the sura on the device. Play is also the keep (ADR-0083), so this is
   * called after the first Ayah is sounding; a metered connection is refused
   * silently and the caller paints nothing.
   */
  async keep(
    surah: number,
    ayahCount: number,
    onProgress: (progress: KeepProgress) => void
  ): Promise<KeepOutcome> {
    try {
      const result = await downloadSurahAudio(surah, {
        allowMetered: false,
        onProgress: (progress) => onProgress({ done: progress.done, total: progress.total }),
      });
      const saved =
        result.stored > 0 || result.reused > 0
          ? 'complete'
          : await this.readSaved(surah, ayahCount);
      return { saved, phase: 'done' };
    } catch (error) {
      const saved = await this.readSaved(surah, ayahCount);
      if (error instanceof SurahAudioDownloadError) {
        return { saved, phase: error.refusal === 'metered' ? 'metered' : 'unsupported' };
      }
      logRecitationFailure('surah audio download failed', error);
      return { saved, phase: 'failed' };
    }
  }

  dispose(): void {
    this.disposed = true;
    this.requestId += 1;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.removeEventListener('ended', this.onEnded);
    this.audio.removeEventListener('timeupdate', this.onTimeUpdate);
    this.audio.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    this.audio.removeEventListener('durationchange', this.onLoadedMetadata);
    this.audio.removeEventListener('playing', this.onPlaying);
    this.audio.removeEventListener('pause', this.onPause);
    this.audio.removeEventListener('error', this.onError);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
    }
    this.releaseBlob();
    this.releasePrefetched();
    this.audio.remove();
    this.listeners.clear();
  }

  private readonly onEnded = (): void => {
    if (this.disposed) return;
    const playlist = this.playlist;
    if (!playlist) return;
    if (this.index + 1 < playlist.files.length) {
      void this.playAt(this.index + 1);
      return;
    }
    void this.playNextSurah();
  };

  private readonly onTimeUpdate = (): void => {
    const playlist = this.playlist;
    if (!playlist) return;

    const position = this.audioSafeTime();
    const surahPosition = startOf(playlist.timeline, this.index) + position;
    const duration = this.durationOf(this.index);

    // The system's progress is cheaper than React's and is what the lock screen
    // reads, so it follows every event rather than the once-a-second UI update.
    this.session?.position(surahPosition, playlist.timeline.total);

    const now = this.now();
    if (now - this.lastPersistAt >= PERSIST_INTERVAL_MS) this.persist();

    if (now - this.lastUiAt < UI_INTERVAL_MS) return;
    this.lastUiAt = now;
    this.setState({
      position,
      duration,
      surahPosition,
      surahDuration: playlist.timeline.total,
    });
  };

  private readonly onLoadedMetadata = (): void => {
    const playlist = this.playlist;
    if (!playlist) return;

    const actual = this.audio.duration;
    if (Number.isFinite(actual) && actual > 0) {
      playlist.timeline = withAyahSeconds(playlist.timeline, this.index, actual);
    }

    if (this.pendingOffset !== null) {
      const offset = this.pendingOffset;
      this.pendingOffset = null;
      this.seekWithin(offset);
    }

    this.setState({
      duration: this.durationOf(this.index),
      surahPosition: startOf(playlist.timeline, this.index) + this.audioSafeTime(),
      surahDuration: playlist.timeline.total,
    });
    this.session?.position(
      startOf(playlist.timeline, this.index) + this.audioSafeTime(),
      playlist.timeline.total
    );
  };

  private readonly onPlaying = (): void => {
    const playlist = this.playlist;
    if (!playlist) return;
    this.setState({ status: 'playing' });
    this.session?.playback('playing');
    this.session?.position(
      startOf(playlist.timeline, this.index) + this.audioSafeTime(),
      playlist.timeline.total
    );
  };

  private readonly onPause = (): void => {
    if (this.audio.ended) return;
    if (this.state.status !== 'playing' && this.state.status !== 'loading') return;
    this.setState({ status: 'paused' });
    this.session?.playback('paused');
    this.persist();
  };

  private readonly onError = (): void => {
    if (this.disposed) return;
    // Clearing the source on stop is not a failure.
    if (!this.audio.getAttribute('src')) return;
    this.setState({ status: this.state.source === 'device' ? 'error' : 'offline' });
    this.session?.playback('paused');
    this.retry();
  };

  private readonly onVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      this.persist();
      return;
    }
    // A frozen tab can miss the `ended` event entirely; on the way back it is
    // the first thing worth checking.
    if (this.audio.ended && this.playlist) {
      this.onEnded();
      return;
    }
    const playlist = this.playlist;
    if (playlist) {
      this.session?.position(
        startOf(playlist.timeline, this.index) + this.audioSafeTime(),
        playlist.timeline.total
      );
    }
  };

  private readonly onPageHide = (): void => {
    this.persist();
  };

  private async playAt(index: number, offset = 0): Promise<boolean> {
    const playlist = this.playlist;
    const file = playlist?.files[index];
    if (!playlist || !file) return false;

    const request = ++this.requestId;
    this.index = index;
    this.pendingOffset = offset > 0 ? offset : null;

    this.setState({
      status: 'loading',
      ayah: file.ayah,
      source: null,
      position: offset,
      duration: playlist.timeline.seconds[index] ?? 0,
      surahPosition: startOf(playlist.timeline, index) + offset,
      surahDuration: playlist.timeline.total,
    });

    const track: RecitationTrack = {
      surah: playlist.surah,
      name: playlist.name,
      reciter: this.reciter,
      ayah: file.ayah,
      ayahCount: playlist.files.length,
    };
    this.session?.track(track);
    this.session?.position(startOf(playlist.timeline, index) + offset, playlist.timeline.total);

    let source: AudioPlaybackSource | null = this.takePrefetched(playlist.surah, index);
    if (!source) {
      try {
        source = await this.playbackSource(playlist.baseUrl, playlist.surah, file);
      } catch {
        source = null;
      }
    }

    if (request !== this.requestId || this.disposed) {
      if (source?.local) URL.revokeObjectURL(source.url);
      return false;
    }

    // Nothing local and no host to ask: a state to name, not a failure to retry
    // blindly.
    if (!source || !source.url) {
      this.setState({ status: 'offline', source: null });
      this.persist();
      return false;
    }

    const previousBlob = this.currentBlobUrl;
    this.currentBlobUrl = source.local ? source.url : null;
    this.audio.src = source.url;

    try {
      if (offset > 0) {
        try {
          this.audio.currentTime = offset;
        } catch {
          // The element cannot seek before it knows the file; loadedmetadata does.
        }
      }
      await this.audio.play();
    } catch {
      if (request !== this.requestId) return false;
      this.setState({
        status: source.local ? 'error' : 'offline',
        source: source.local ? 'device' : 'host',
      });
      this.session?.playback('paused');
      this.retry();
      return false;
    }

    if (request !== this.requestId || this.disposed) return false;

    if (this.pendingOffset !== null) {
      const pending = this.pendingOffset;
      this.pendingOffset = null;
      this.seekWithin(pending);
    }

    this.retries = 0;
    if (previousBlob && previousBlob !== this.currentBlobUrl) URL.revokeObjectURL(previousBlob);

    this.setState({ status: 'playing', source: source.local ? 'device' : 'host' });
    this.session?.playback('playing');
    this.session?.position(
      startOf(playlist.timeline, this.index) + this.audioSafeTime(),
      playlist.timeline.total
    );
    this.prefetchAhead(index);
    this.persist();
    return true;
  }

  private async playNextSurah(): Promise<void> {
    const current = this.playlist;
    if (!current) return;

    const surah = current.surah + 1;
    if (surah > LAST_SURAH) {
      this.stop();
      return;
    }

    const next =
      this.nextPlaylist?.surah === surah ? this.nextPlaylist : await this.loadNext(surah);
    if (!next) {
      this.stop();
      return;
    }

    this.adopt(next);
    this.prefetchNextSurah(surah + 1);
    await this.playAt(0, 0);
  }

  private adopt(playlist: Playlist): void {
    this.playlist = playlist;
    this.nextPlaylist = null;
    this.nextFor = null;
    this.nextPromise = null;
    this.index = 0;
    this.setState({
      surah: playlist.surah,
      name: playlist.name,
      ayahCount: playlist.files.length,
      ayah: playlist.files[0]?.ayah ?? 1,
      position: 0,
      duration: playlist.timeline.seconds[0] ?? 0,
      surahPosition: 0,
      surahDuration: playlist.timeline.total,
    });
    this.session?.track({
      surah: playlist.surah,
      name: playlist.name,
      reciter: this.reciter,
      ayah: playlist.files[0]?.ayah ?? 1,
      ayahCount: playlist.files.length,
    });
  }

  private async loadPlaylist(surah: number): Promise<Playlist | null> {
    if (!Number.isInteger(surah) || surah < 1 || surah > LAST_SURAH) return null;

    // The manifest comes from the host or, offline, from this device's own kept
    // copy (ADR-0081), so it is asked for first and on its own.
    const playable = await this.loadPlayable(surah);
    if (!playable || playable.manifest.files.length === 0) return null;

    // The edition is what names the reciter and gives the byte-rate the
    // timeline is estimated from. Offline it may not answer, and a kept sura
    // still plays: the element's real durations correct the estimate.
    try {
      const edition = await this.loadEdition();
      this.bitrateKbps = edition.bitrateKbps;
      this.reciter = edition.reciter;
    } catch {
      // Keep the last known edition.
    }

    return {
      surah,
      name: playable.manifest.name,
      baseUrl: playable.baseUrl,
      files: playable.manifest.files,
      timeline: buildTimeline(playable.manifest.files, this.bitrateKbps),
    };
  }

  private loadNext(surah: number): Promise<Playlist | null> {
    if (surah > LAST_SURAH) return Promise.resolve(null);
    if (this.nextFor === surah && this.nextPromise) return this.nextPromise;

    this.nextFor = surah;
    this.nextPromise = this.loadPlaylist(surah)
      .then((playlist) => {
        if (this.nextFor === surah) this.nextPlaylist = playlist;
        return playlist;
      })
      .catch(() => null);
    return this.nextPromise;
  }

  private prefetchAhead(index: number): void {
    const playlist = this.playlist;
    if (!playlist || !this.prefetchEnabled) return;

    const next = playlist.files[index + 1];
    if (next) {
      void this.storePrefetched(playlist.surah, playlist.baseUrl, index + 1, next);
      return;
    }
    // The last Ayah: the next thing heard is another sura's first.
    this.prefetchNextSurah(playlist.surah + 1);
  }

  private prefetchNextSurah(surah: number): void {
    if (!this.prefetchEnabled || surah > LAST_SURAH) return;
    void this.loadNext(surah).then((playlist) => {
      const first = playlist?.files[0];
      if (!playlist || !first) return;
      void this.storePrefetched(playlist.surah, playlist.baseUrl, 0, first);
    });
  }

  private async storePrefetched(
    surah: number,
    baseUrl: string,
    index: number,
    file: QuranAudioFile
  ): Promise<void> {
    const key = `${surah}:${index}`;
    if (this.disposed || this.prefetched.has(key)) return;

    let url: string | null;
    try {
      const source = await this.playbackSource(baseUrl, surah, file);
      if (!source.url) return;
      if (source.local) {
        url = source.url;
      } else {
        const response = await this.fetcher(source.url, { mode: 'cors' });
        if (!response.ok) return;
        url = URL.createObjectURL(await response.blob());
      }
    } catch {
      // A prefetch that cannot finish is a prefetch the next Ayah does without.
      return;
    }

    if (this.disposed || !url) {
      if (url) URL.revokeObjectURL(url);
      return;
    }

    // Two files at most: the next Ayah, and the first of the next sura.
    while (this.prefetched.size >= 2) {
      const oldest = this.prefetched.keys().next();
      if (oldest.done) break;
      const value = this.prefetched.get(oldest.value);
      this.prefetched.delete(oldest.value);
      if (value) URL.revokeObjectURL(value);
    }
    this.prefetched.set(key, url);
  }

  private takePrefetched(surah: number, index: number): AudioPlaybackSource | null {
    const key = `${surah}:${index}`;
    const url = this.prefetched.get(key);
    if (!url) return null;
    this.prefetched.delete(key);
    return { url, local: true };
  }

  private releasePrefetched(): void {
    for (const url of this.prefetched.values()) URL.revokeObjectURL(url);
    this.prefetched.clear();
  }

  private releaseBlob(): void {
    if (!this.currentBlobUrl) return;
    URL.revokeObjectURL(this.currentBlobUrl);
    this.currentBlobUrl = null;
  }

  private seekWithin(seconds: number): void {
    const duration = this.audio.duration;
    const limit = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    const target = Math.min(Math.max(seconds, 0), Math.max(limit - 0.1, 0));
    try {
      this.audio.currentTime = target;
    } catch {
      // A seek the element refuses leaves it where it was.
      return;
    }
    const playlist = this.playlist;
    if (!playlist) return;
    this.setState({
      position: target,
      surahPosition: startOf(playlist.timeline, this.index) + target,
    });
    this.session?.position(
      startOf(playlist.timeline, this.index) + target,
      playlist.timeline.total
    );
  }

  private audioSafeTime(): number {
    const time = this.audio.currentTime;
    return Number.isFinite(time) && time > 0 ? time : 0;
  }

  private durationOf(index: number): number {
    const actual = this.audio.duration;
    if (Number.isFinite(actual) && actual > 0) return actual;
    return this.playlist?.timeline.seconds[index] ?? 0;
  }

  private retry(): void {
    if (this.retryTimer !== null) return;
    if (this.retries >= MAX_RETRIES) {
      this.retries = 0;
      return;
    }
    this.retries += 1;
    const index = this.index;
    const offset = this.state.position;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.disposed) return;
      void this.playAt(index, offset);
    }, this.retries * 1500);
  }

  private restore(): void {
    const stored = readStoredRecitation(this.storage);
    if (!stored) return;

    this.setState({
      status: 'paused',
      surah: stored.surah,
      name: stored.name,
      ayahCount: stored.ayahCount,
      ayah: stored.ayah,
      position: stored.offset,
    });
    this.session?.track({
      surah: stored.surah,
      name: stored.name,
      reciter: '',
      ayah: stored.ayah,
      ayahCount: stored.ayahCount,
    });
    this.session?.playback('paused');
  }

  private persist(): void {
    const playlist = this.playlist;
    const state = this.state;
    if (!playlist || state.surah === null || state.name === null) return;
    writeStoredRecitation(
      {
        surah: state.surah,
        name: state.name,
        ayah: state.ayah,
        ayahCount: playlist.files.length,
        offset: this.audioSafeTime(),
      },
      this.storage
    );
  }

  private setState(patch: Partial<RecitationState>): void {
    const next: RecitationState = { ...this.state, ...patch };
    if (sameState(this.state, next)) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

let shared: RecitationEngine | null = null;

/** The document's one engine. */
export function recitationEngine(): RecitationEngine {
  shared ??= new RecitationEngine();
  return shared;
}

/** Drops the shared engine, for tests and a hot reload that outlived it. */
export function resetRecitationEngine(): void {
  shared?.dispose();
  shared = null;
}
