'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { readDownloadedSurahBytes, removeDownloadedSurah } from '@/frontend/api/quran/audio';
import type { SurahAudioState } from '@/frontend/shared/local-store/audio';
import { logRecitationFailure } from '@/frontend/shared/recitation/log';
import {
  INITIAL_RECITATION_STATE,
  type KeepPhase,
  type PlayOptions,
  type RecitationPlayer,
  type RecitationState,
} from '@/frontend/shared/recitation/state';

/**
 * The recitation as the app sees it: one player, one state, every surface.
 *
 * Mounted once by the root layout, so a client-side navigation swaps the page
 * under the player and nothing about the sound changes. The reader's float and
 * the mini player are two views of this one value (ADR-0085).
 *
 * The engine is fetched after hydration rather than imported here. The player,
 * its audio stack and the keep are not what a visitor landing on the community
 * page needs in their first bundle; the mini player appears a beat later when
 * the engine arrives. Every action waits for it, so a press on the reader's
 * float before it lands still starts the sura.
 *
 * The keep (ADR-0083, ADR-0081) lives here rather than in the float for the same
 * reason: leaving the sura's page used to cancel a download the reader had
 * already paid to start.
 */

export interface KeepState {
  readonly phase: KeepPhase;
  readonly done: number;
  readonly total: number;
}

export interface QuranPlayerActions {
  /** Starts a sura (or resumes a restored one); `ayah` is 1-based. */
  play(surah: number, options?: PlayOptions): Promise<boolean>;
  toggle(): Promise<void>;
  stop(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  seekBy(seconds: number): void;
  /** Re-reads what this device holds for a sura. */
  refreshSaved(surah: number, ayahCount: number): void;
  /** Drops this sura's copies, so it streams from the host again; true when they went. */
  remove(surah: number): Promise<boolean>;
}

export interface QuranPlayerValue {
  readonly state: RecitationState;
  readonly saved: Readonly<Record<number, SurahAudioState | null>>;
  /** What those copies cost the device, per sura, in bytes. */
  readonly savedBytes: Readonly<Record<number, number>>;
  readonly keep: Readonly<Record<number, KeepState>>;
  readonly actions: QuranPlayerActions;
}

const QuranPlayerContext = createContext<QuranPlayerValue | null>(null);

/**
 * A reader rendered without the app shell — a unit test, a preview — still reads:
 * there is simply no sound to offer it. The root layout always provides the real
 * one, so this is a floor, not a second implementation.
 */
const DETACHED_PLAYER: QuranPlayerValue = {
  state: INITIAL_RECITATION_STATE,
  saved: {},
  savedBytes: {},
  keep: {},
  actions: {
    play: async () => false,
    toggle: async () => {},
    stop: () => {},
    next: () => {},
    previous: () => {},
    seek: () => {},
    seekBy: () => {},
    refreshSaved: () => {},
    remove: async () => false,
  },
};

export function useQuranPlayer(): QuranPlayerValue {
  return useContext(QuranPlayerContext) ?? DETACHED_PLAYER;
}

interface QuranPlayerProviderProps {
  children: ReactNode;
  /** Tests can hand in their own player. */
  engine?: RecitationPlayer;
}

export function QuranPlayerProvider({ children, engine }: QuranPlayerProviderProps) {
  const [player, setPlayer] = useState<RecitationPlayer | null>(engine ?? null);
  const playerRef = useRef<RecitationPlayer | null>(engine ?? null);
  const loadingRef = useRef<Promise<RecitationPlayer | null> | null>(null);

  useEffect(() => {
    if (engine) {
      playerRef.current = engine;
      setPlayer(engine);
      return;
    }
    if (playerRef.current) return;

    let cancelled = false;
    const loading = import('@/frontend/shared/recitation/player')
      .then(({ recitationPlayer }) => recitationPlayer())
      .catch((error: unknown) => {
        logRecitationFailure('the recitation player could not start', error);
        return null;
      });
    loadingRef.current = loading;

    void loading.then((loaded) => {
      if (cancelled || !loaded) return;
      playerRef.current = loaded;
      setPlayer(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [engine]);

  /** The player once its chunk is here; actions wait on this instead of a null. */
  const ready = useCallback(async (): Promise<RecitationPlayer | null> => {
    if (playerRef.current) return playerRef.current;
    let loading = loadingRef.current;
    if (!loading) {
      // A child effect (the reader's float) can run before this provider's own
      // effect has started the import. One microtask is enough for that effect
      // to have set the promise; without it the float reads an empty store on
      // mount and never paints the copy the device already holds.
      await Promise.resolve();
      loading = loadingRef.current;
    }
    if (!loading) return null;
    const loaded = await loading;
    if (loaded) playerRef.current = loaded;
    return loaded;
  }, []);

  const subscribe = useCallback(
    (listener: () => void) => player?.subscribe(listener) ?? (() => {}),
    [player]
  );
  const getSnapshot = useCallback(() => player?.getState() ?? INITIAL_RECITATION_STATE, [player]);
  const state = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL_RECITATION_STATE);

  const [saved, setSaved] = useState<Record<number, SurahAudioState | null>>({});
  const [savedBytes, setSavedBytes] = useState<Record<number, number>>({});
  const [keep, setKeep] = useState<Record<number, KeepState>>({});

  const refreshSaved = useCallback(
    (surah: number, ayahCount: number) => {
      void ready().then((current) => {
        if (!current) return;
        // The state first, then the size: both open the same IndexedDB database,
        // and opening it twice at once races the second connection's upgrade.
        void current.readSaved(surah, ayahCount).then(
          (value) => {
            setSaved((previous) =>
              previous[surah] === value ? previous : { ...previous, [surah]: value }
            );
            if (value === 'none' || value === null) {
              setSavedBytes((previous) =>
                previous[surah] === 0 ? previous : { ...previous, [surah]: 0 }
              );
              return;
            }
            void readDownloadedSurahBytes(surah).then(
              (bytes) =>
                setSavedBytes((previous) =>
                  previous[surah] === bytes ? previous : { ...previous, [surah]: bytes }
                ),
              () =>
                setSavedBytes((previous) =>
                  previous[surah] === 0 ? previous : { ...previous, [surah]: 0 }
                )
            );
          },
          () => {
            // A device with no store is a device that holds no copy: not an
            // error to show, and not a reason to hide the player.
            setSaved((previous) =>
              previous[surah] === null ? previous : { ...previous, [surah]: null }
            );
            setSavedBytes((previous) =>
              previous[surah] === 0 ? previous : { ...previous, [surah]: 0 }
            );
          }
        );
      });
    },
    [ready]
  );

  const keepSurah = useCallback(
    async (surah: number, ayahCount: number) => {
      const current = await ready();
      if (!current) return;

      setKeep((previous) => ({ ...previous, [surah]: { phase: 'working', done: 0, total: 0 } }));

      try {
        const outcome = await current.keep(surah, ayahCount, (progress) => {
          setKeep((previous) => ({
            ...previous,
            [surah]: { phase: 'working', done: progress.done, total: progress.total },
          }));
        });

        setSaved((previous) => ({ ...previous, [surah]: outcome.saved }));
        setKeep((previous) => ({
          ...previous,
          [surah]: { phase: outcome.phase, done: 0, total: 0 },
        }));
        // The copy's size is a second read of the store, so the saved line
        // states what the download actually cost.
        refreshSaved(surah, ayahCount);
      } catch (error) {
        logRecitationFailure('surah audio download failed', error);
        setKeep((previous) => ({ ...previous, [surah]: { phase: 'failed', done: 0, total: 0 } }));
      }
    },
    [ready, refreshSaved]
  );

  const activeSurah = state.surah;
  const activeAyahCount = state.ayahCount;

  // The element is mounted after the engine arrives, outside React's tree, so it
  // can outlive the page that started the sound.
  useEffect(() => {
    player?.mount();
  }, [player]);

  // What this device holds, whenever the player moves to another sura.
  useEffect(() => {
    if (activeSurah === null || activeAyahCount === 0) return;
    refreshSaved(activeSurah, activeAyahCount);
  }, [activeSurah, activeAyahCount, refreshSaved]);

  // Play is also the keep (ADR-0083): once, per sura, per listen. A pause and a
  // second press retries a keep that failed, which is the ADR's retry rule.
  const attempted = useRef(new Set<number>());
  const running = useRef(new Set<number>());

  useEffect(() => {
    if (activeSurah === null) {
      attempted.current.clear();
      running.current.clear();
      return;
    }
    if (state.status === 'playing') {
      if (attempted.current.has(activeSurah) || running.current.has(activeSurah)) return;
      if (saved[activeSurah] === 'complete') return;
      attempted.current.add(activeSurah);
      running.current.add(activeSurah);
      void keepSurah(activeSurah, activeAyahCount).finally(() => {
        running.current.delete(activeSurah);
      });
      return;
    }

    if (state.status === 'paused' || state.status === 'idle') {
      attempted.current.delete(activeSurah);
    }
  }, [state.status, activeSurah, activeAyahCount, saved, keepSurah]);

  const actions = useMemo<QuranPlayerActions>(
    () => ({
      play: async (surah, options) => {
        const current = await ready();
        return current ? current.play(surah, options) : false;
      },
      toggle: async () => {
        const current = await ready();
        await current?.toggle();
      },
      stop: () => {
        playerRef.current?.stop();
      },
      next: () => {
        playerRef.current?.next();
      },
      previous: () => {
        playerRef.current?.previous();
      },
      seek: (seconds) => {
        playerRef.current?.seek(seconds);
      },
      seekBy: (seconds) => {
        playerRef.current?.seekBy(seconds);
      },
      refreshSaved,
      remove: async (surah) => {
        try {
          await removeDownloadedSurah(surah);
          setSaved((previous) => ({ ...previous, [surah]: 'none' }));
          setSavedBytes((previous) => ({ ...previous, [surah]: 0 }));
          setKeep((previous) => {
            const next = { ...previous };
            delete next[surah];
            return next;
          });
          return true;
        } catch (error) {
          logRecitationFailure('surah audio removal failed', error);
          return false;
        }
      },
    }),
    [ready, refreshSaved]
  );

  const value = useMemo<QuranPlayerValue>(
    () => ({ state, saved, savedBytes, keep, actions }),
    [state, saved, savedBytes, keep, actions]
  );

  return <QuranPlayerContext.Provider value={value}>{children}</QuranPlayerContext.Provider>;
}
