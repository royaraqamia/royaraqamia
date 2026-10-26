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

import {
  downloadSurahAudio,
  readDownloadedSurah,
  SurahAudioDownloadError,
} from '@/frontend/api/quran/audio';
import type { SurahAudioState } from '@/frontend/shared/local-store/audio';
import {
  INITIAL_RECITATION_STATE,
  logRecitationFailure,
  recitationEngine,
  type PlayOptions,
  type RecitationEngine,
  type RecitationState,
} from '@/frontend/shared/recitation/engine';

/**
 * The recitation as the app sees it: one engine, one state, every surface.
 *
 * Mounted once by the root layout, so a client-side navigation swaps the page
 * under the player and nothing about the sound changes. The reader's float and
 * the mini player are two views of this one value (ADR-0085).
 *
 * The keep (ADR-0083, ADR-0081) lives here rather than in the float for the same
 * reason: leaving the sura's page used to cancel a download the reader had
 * already paid to start.
 */

export type KeepPhase = 'working' | 'done' | 'metered' | 'unsupported' | 'failed';

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
}

export interface QuranPlayerValue {
  readonly state: RecitationState;
  readonly saved: Readonly<Record<number, SurahAudioState | null>>;
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
  },
};

export function useQuranPlayer(): QuranPlayerValue {
  return useContext(QuranPlayerContext) ?? DETACHED_PLAYER;
}

interface QuranPlayerProviderProps {
  children: ReactNode;
  /** Tests and the native shell can hand in their own engine. */
  engine?: RecitationEngine;
}

export function QuranPlayerProvider({ children, engine }: QuranPlayerProviderProps) {
  const engineRef = useRef<RecitationEngine | null>(null);
  if (typeof window !== 'undefined' && engineRef.current === null) {
    engineRef.current = engine ?? recitationEngine();
  }

  const subscribe = useCallback((listener: () => void) => {
    return engineRef.current?.subscribe(listener) ?? (() => {});
  }, []);
  const getSnapshot = useCallback(
    () => engineRef.current?.getState() ?? INITIAL_RECITATION_STATE,
    []
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL_RECITATION_STATE);

  const [saved, setSaved] = useState<Record<number, SurahAudioState | null>>({});
  const [keep, setKeep] = useState<Record<number, KeepState>>({});

  const refreshSaved = useCallback((surah: number, ayahCount: number) => {
    void readDownloadedSurah(surah, ayahCount)
      .then((value) => {
        setSaved((previous) =>
          previous[surah] === value ? previous : { ...previous, [surah]: value }
        );
      })
      .catch(() => {
        // A device with no store is a device that holds no copy: not an error to
        // show, and not a reason to hide the player.
        setSaved((previous) =>
          previous[surah] === null ? previous : { ...previous, [surah]: null }
        );
      });
  }, []);

  const keepSurah = useCallback(async (surah: number, ayahCount: number) => {
    setKeep((previous) => ({ ...previous, [surah]: { phase: 'working', done: 0, total: 0 } }));

    try {
      const result = await downloadSurahAudio(surah, {
        allowMetered: false,
        onProgress: (progress) => {
          setKeep((previous) => ({
            ...previous,
            [surah]: { phase: 'working', done: progress.done, total: progress.total },
          }));
        },
      });

      const next =
        result.stored > 0 || result.reused > 0
          ? 'complete'
          : await readDownloadedSurah(surah, ayahCount);
      setSaved((previous) => ({ ...previous, [surah]: next }));
      setKeep((previous) => ({ ...previous, [surah]: { phase: 'done', done: 0, total: 0 } }));
    } catch (error) {
      if (error instanceof SurahAudioDownloadError) {
        // A meter is silent by design (ADR-0083's amendment); a device that
        // cannot keep a copy is equally not the reader's question.
        setKeep((previous) => ({
          ...previous,
          [surah]: {
            phase: error.refusal === 'metered' ? 'metered' : 'unsupported',
            done: 0,
            total: 0,
          },
        }));
        return;
      }
      logRecitationFailure('surah audio download failed', error);
      setKeep((previous) => ({ ...previous, [surah]: { phase: 'failed', done: 0, total: 0 } }));
    }
  }, []);

  const activeSurah = state.surah;
  const activeAyahCount = state.ayahCount;

  // The element is mounted after hydration, outside React's tree, so it can
  // outlive the page that started the sound.
  useEffect(() => {
    engineRef.current?.mount();
  }, []);

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
      play: (surah, options) => engineRef.current?.play(surah, options) ?? Promise.resolve(false),
      toggle: () => engineRef.current?.toggle() ?? Promise.resolve(),
      stop: () => engineRef.current?.stop(),
      next: () => engineRef.current?.next(),
      previous: () => engineRef.current?.previous(),
      seek: (seconds) => engineRef.current?.seek(seconds),
      seekBy: (seconds) => engineRef.current?.seekBy(seconds),
      refreshSaved,
    }),
    [refreshSaved]
  );

  const value = useMemo<QuranPlayerValue>(
    () => ({ state, saved, keep, actions }),
    [state, saved, keep, actions]
  );

  return <QuranPlayerContext.Provider value={value}>{children}</QuranPlayerContext.Provider>;
}
