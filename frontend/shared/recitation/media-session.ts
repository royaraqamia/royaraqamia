/**
 * The system's view of the recitation: lock screen, notification shade, media
 * keys, headphones and the browser's own media overlay.
 *
 * Everything here is optional. A browser without the Media Session API gets a
 * player that still plays; it just has no controls outside the page. A browser
 * that knows the API but refuses one action (iOS refuses most of them) keeps the
 * actions it does support, because each handler is registered on its own.
 */

export interface RecitationTrack {
  readonly surah: number;
  readonly name: string;
  /** The reciter, as the edition publishes the name. */
  readonly reciter: string;
  readonly ayah: number;
  readonly ayahCount: number;
}

export type RecitationPlaybackState = 'playing' | 'paused' | 'none';

export interface RecitationMediaHandlers {
  play(): void;
  pause(): void;
  stop(): void;
  previous(): void;
  next(): void;
  seekTo(seconds: number): void;
  seekBy(seconds: number): void;
}

export interface RecitationMediaSession {
  bind(handlers: RecitationMediaHandlers): void;
  track(track: RecitationTrack): void;
  playback(state: RecitationPlaybackState): void;
  position(position: number, duration: number): void;
  clear(): void;
}

/**
 * One cover for every sura: the metadata names the sura and the Ayah, and the
 * artwork is the brand's own mark. Per-sura artwork would be 114 assets for a
 * surface that shows for seconds, and text on the artwork competes with the
 * title the system already draws.
 */
export const RECITATION_ARTWORK = [
  { src: '/quran/audio/cover-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/quran/audio/cover-1024.png', sizes: '1024x1024', type: 'image/png' },
] as const;

const SEEK_STEP_SECONDS = 10;

function absolute(path: string): string {
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

export function createRecitationMediaSession(): RecitationMediaSession | null {
  if (typeof navigator === 'undefined') return null;
  const session = navigator.mediaSession;
  if (!session) return null;

  return {
    bind(handlers) {
      const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
        try {
          session.setActionHandler(action, handler);
        } catch {
          // An action this browser does not know is not an error.
        }
      };

      set('play', () => handlers.play());
      set('pause', () => handlers.pause());
      set('stop', () => handlers.stop());
      set('previoustrack', () => handlers.previous());
      set('nexttrack', () => handlers.next());
      set('seekbackward', (details) => handlers.seekBy(-(details.seekOffset ?? SEEK_STEP_SECONDS)));
      set('seekforward', (details) => handlers.seekBy(details.seekOffset ?? SEEK_STEP_SECONDS));
      set('seekto', (details) => {
        if (typeof details.seekTime === 'number') handlers.seekTo(details.seekTime);
      });
    },

    track(track) {
      if (typeof MediaMetadata === 'undefined') return;
      try {
        session.metadata = new MediaMetadata({
          title: `سورة ${track.name}`,
          artist: track.reciter
            ? `الآية ${track.ayah} من ${track.ayahCount} · ${track.reciter}`
            : `الآية ${track.ayah} من ${track.ayahCount}`,
          album: 'القرآن الكريم',
          artwork: RECITATION_ARTWORK.map((art) => ({ ...art, src: absolute(art.src) })),
        });
      } catch {
        // A metadata shape this browser refuses leaves the previous one in place.
      }
    },

    playback(state) {
      try {
        session.playbackState = state;
      } catch {
        // Writing the state is best-effort.
      }
    },

    position(position, duration) {
      try {
        if (!Number.isFinite(duration) || duration <= 0) {
          session.setPositionState();
          return;
        }
        const clamped = Math.min(Math.max(position, 0), Math.max(duration - 0.001, 0));
        session.setPositionState({ duration, position: clamped, playbackRate: 1 });
      } catch {
        // Position state is a nicety; an unsupported one is skipped.
      }
    },

    clear() {
      try {
        session.metadata = null;
        session.playbackState = 'none';
        session.setPositionState();
      } catch {
        // Nothing to clear.
      }
    },
  };
}
