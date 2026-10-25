'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pause, Play, Square } from 'lucide-react';
import {
  audioPlaybackSource,
  downloadSurahAudio,
  loadPlayableSurah,
  readDownloadedSurah,
  SurahAudioDownloadError,
} from '@/frontend/api/quran/audio';
import { formatBytes } from '@/frontend/shared/format-bytes';
import { logger } from '@/frontend/shared/logger';
import type { QuranSurahAudio } from '@/shared/contracts/quran-audio';
import type { SurahAudioState } from '@/frontend/shared/local-store/audio';

type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'offline';

/** The download control's own state; `saved` is where the device stands. */
type DownloadPhase = 'idle' | 'working' | 'metered' | 'failed' | 'unsupported';

interface DownloadState {
  readonly phase: DownloadPhase;
  /** Ayat done of the Surah's total; 0 when nothing has started. */
  readonly done: number;
  readonly total: number;
}

const IDLE_DOWNLOAD: DownloadState = { phase: 'idle', done: 0, total: 0 };

interface SurahAudioPlayerProps {
  surah: number;
  ayahCount: number;
  /** What the whole sura weighs, which is what it costs a reader on mobile data. */
  bytes: number;
  /** The Ayah currently playing, or null once the recitation has stopped. */
  onAyahChange?: (ayah: number | null) => void;
}

/**
 * Plays a sura's Recitation, one Ayah file after another (ADR-0062), and lets
 * the reader keep a copy of it for listening offline (#559, ADR-0081).
 *
 * The controls float over the reader as bare round buttons, the way the app's
 * other floats do: play, stop and the Ayah being played stay reachable wherever
 * the reader has scrolled to, and the reading column keeps its full width.
 *
 * Play is also the only way to keep a sura offline now: pressing it starts the
 * first Ayah straight away and keeps the rest on the device in the background,
 * so a reader who never asks for a download still ends up able to listen
 * without a network. A metered connection is the one case that still asks.
 *
 * The files are one Ayah each, so playback is a queue: when a file ends the next
 * one begins. That costs a small gap at each Ayah — which the reciter's own pause
 * absorbs — and buys two things a single two-hour file cannot: the Ayah being
 * played is exactly the file being played, and a reader who stops after twenty
 * ayat has paid for twenty ayat rather than for the sura.
 *
 * Playback prefers a copy on this device and falls back to the host, so a reader
 * on a plane and a reader on mobile data take the same code path. Nothing is
 * fetched until play is pressed: merely reading a sura costs no audio bandwidth.
 */
export function SurahAudioPlayer({ surah, ayahCount, bytes, onAyahChange }: SurahAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<QuranSurahAudio | null>(null);
  const baseUrlRef = useRef<string | null>(null);
  const positionRef = useRef(0);
  /** The `blob:` URL of the Ayah playing from this device, if it is one. */
  const objectUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [ayah, setAyah] = useState(1);
  const [saved, setSaved] = useState<SurahAudioState | null>(null);
  const [download, setDownload] = useState<DownloadState>(IDLE_DOWNLOAD);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // Leaving the sura must not leave a recitation playing behind it, nor a blob
  // URL alive for a page it no longer belongs to.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  // What the device already holds, so the state is visible before a plane.
  useEffect(() => {
    let live = true;
    void readDownloadedSurah(surah, ayahCount)
      .then((state) => {
        if (live) setSaved(state);
      })
      .catch(() => {
        if (live) setSaved(null);
      });
    return () => {
      live = false;
    };
  }, [surah, ayahCount]);

  /** Plays one Ayah file; says whether sound is actually coming out. */
  const playAt = useCallback(
    async (position: number): Promise<boolean> => {
      const audio = audioRef.current;
      const file = playlistRef.current?.files[position];
      const baseUrl = baseUrlRef.current;
      if (!audio || !baseUrl || !file) {
        setStatus('idle');
        onAyahChange?.(null);
        return false;
      }

      positionRef.current = position;
      setAyah(file.ayah);
      const source = await audioPlaybackSource(baseUrl, surah, file);
      releaseObjectUrl();
      if (source.local) objectUrlRef.current = source.url;

      // Nothing local and no host to ask: the state to name, not a failure to
      // retry blindly.
      if (!source.url) {
        setStatus('offline');
        onAyahChange?.(null);
        return false;
      }

      audio.src = source.url;

      try {
        await audio.play();
        setStatus('playing');
        onAyahChange?.(file.ayah);
        return true;
      } catch {
        // A refusal to play while the device is offline is a state to name, not
        // a failure: the Ayah it wanted is on the host, and the host is away.
        setStatus(source.local ? 'error' : 'offline');
        onAyahChange?.(null);
        return false;
      }
    },
    [onAyahChange, releaseObjectUrl, surah]
  );

  const prepare = useCallback(async () => {
    if (playlistRef.current) return true;

    const playable = await loadPlayableSurah(surah);
    if (!playable || playable.manifest.files.length === 0) return false;

    playlistRef.current = playable.manifest;
    baseUrlRef.current = playable.baseUrl;
    return true;
  }, [surah]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    releaseObjectUrl();
    positionRef.current = 0;
    setAyah(1);
    onAyahChange?.(null);
    setStatus('idle');
  }, [onAyahChange, releaseObjectUrl]);

  /**
   * Keeps this Surah on the device.
   *
   * `confirmed` is the reader's answer to the metered prompt: the whole
   * difference between "kept without asking" and consent. The play button calls
   * this itself once the first Ayah is playing, so a reader who never asks for a
   * download still ends up able to listen offline.
   */
  const startDownload = useCallback(
    async (confirmed: boolean) => {
      setDownload({ phase: 'working', done: 0, total: ayahCount });

      try {
        const result = await downloadSurahAudio(surah, {
          allowMetered: confirmed,
          onProgress: (progress) =>
            setDownload({ phase: 'working', done: progress.done, total: progress.total }),
        });
        setSaved(result.stored > 0 || result.reused > 0 ? 'complete' : saved);
        setDownload(IDLE_DOWNLOAD);
      } catch (error) {
        if (error instanceof SurahAudioDownloadError) {
          // A meter is the reader's decision to make; a device that simply
          // cannot keep a copy is not, and saying so would answer a question
          // nobody asked.
          setDownload(
            error.refusal === 'metered'
              ? { phase: 'metered', done: 0, total: 0 }
              : { phase: 'unsupported', done: 0, total: 0 }
          );
          return;
        }
        setDownload({ phase: 'failed', done: 0, total: 0 });
        logger.error('surah audio download failed', {
          surah,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [ayahCount, saved, surah]
  );

  const keepInBackground = useCallback(() => {
    // A keep that the device cannot do, or that the reader has not answered for
    // yet, is not retried behind their back on the next press.
    if (
      saved === 'complete' ||
      download.phase === 'working' ||
      download.phase === 'unsupported' ||
      download.phase === 'metered'
    ) {
      return;
    }
    void startDownload(false);
  }, [saved, download.phase, startDownload]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || status === 'loading') return;

    if (status === 'playing') {
      audio.pause();
      setStatus('paused');
      return;
    }
    if (status === 'paused') {
      try {
        await audio.play();
        setStatus('playing');
      } catch {
        setStatus(objectUrlRef.current ? 'error' : 'offline');
      }
      return;
    }

    const from = status === 'error' || status === 'offline' ? 0 : positionRef.current;
    setStatus('loading');
    try {
      if (!(await prepare())) {
        // No playlist could be read: offline, that is the surah not being kept
        // rather than a failure of this one.
        setStatus('offline');
        return;
      }
      // Playback comes first: the first Ayah is already sounding, so keeping the
      // rest can take as long as it takes.
      if (await playAt(from)) keepInBackground();
    } catch {
      setStatus('offline');
    }
  }, [status, prepare, playAt, keepInBackground]);

  const advance = useCallback(() => {
    const total = playlistRef.current?.files.length ?? 0;
    const next = positionRef.current + 1;
    if (next < total) void playAt(next);
    else stop();
  }, [playAt, stop]);

  const isPlaying = status === 'playing';
  const isBusy = status === 'loading';
  const label = isPlaying
    ? 'إيقاف مؤقّت'
    : status === 'paused'
      ? 'متابعة'
      : isBusy
        ? 'جاري التَّحميل…'
        : status === 'error' || status === 'offline'
          ? 'إعادة المحاولة'
          : 'استمع للسُّورة';
  const Icon = isPlaying
    ? Pause
    : isBusy
      ? Loader2
      : status === 'error' || status === 'offline'
        ? AlertTriangle
        : Play;

  const size = formatBytes(bytes);
  const showCounter = isPlaying || status === 'paused';

  return (
    <section
      aria-label="تلاوة السُّورة"
      // What this device holds for the sura, once that has been read. A browser
      // test waits on it rather than guessing when hydration finished.
      data-audio-state={saved ?? 'unknown'}
      className="fixed inset-e-4 bottom-[calc(3.5rem+var(--roy-safe-bottom))] z-40 flex w-fit max-w-[calc(100vw-2rem)] flex-col items-end gap-1.5"
    >
      <div className="flex items-center gap-2">
        {(isPlaying || status === 'paused') && (
          <button
            type="button"
            onClick={stop}
            aria-label="إيقاف التِّلاوة"
            title="إيقاف التِّلاوة"
            className="inline-flex size-11 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-md shadow-foreground/10 transition-safe hover:border-border hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Square aria-hidden="true" className="size-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => void toggle()}
          disabled={isBusy}
          aria-label={label}
          title={label}
          className="inline-flex size-14 items-center justify-center rounded-full border border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)] transition-safe hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 hover:shadow-[0_15px_35px_-5px_rgba(147,51,234,0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          <Icon aria-hidden="true" className={`size-6 ${isBusy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {showCounter ? (
        <p
          aria-live="polite"
          className="rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          الآية <span className="font-heading">{ayah}</span> من{' '}
          <span className="font-heading">{ayahCount}</span>
        </p>
      ) : null}

      {download.phase === 'working' ? (
        <p
          aria-live="polite"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          جاري الحفظ… <span className="font-heading">{download.done}</span> من{' '}
          <span className="font-heading">{download.total}</span>
        </p>
      ) : saved === 'complete' ? (
        <p className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-bold text-primary shadow-sm">
          <Check aria-hidden="true" className="size-3" />
          محفوظة على هذا الجُهاز، تعمل دون اتِّصال
        </p>
      ) : saved === 'partial' ? (
        <p className="rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
          بعض آياتها محفوظة فقط
        </p>
      ) : download.phase === 'metered' ? (
        <p className="max-w-64 rounded-xl border border-border/60 bg-card px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
          أنت على اتِّصال مدفوع. حفظ التِّلاوة كاملة ينزّل {size ?? 'بيانات'} إضافيَّة:{' '}
          <button
            type="button"
            onClick={() => void startDownload(true)}
            className="font-bold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            احفظ على أي حال
          </button>
        </p>
      ) : status === 'offline' ? (
        <p className="max-w-64 rounded-xl border border-border/60 bg-card px-3 py-1.5 text-[11px] text-destructive shadow-sm">
          هذه السُّورة غير محفوظة على هذا الجُهاز، وتحتاج اتِّصالًا لتشغيلها.
        </p>
      ) : status === 'error' ? (
        <p className="max-w-64 rounded-xl border border-border/60 bg-card px-3 py-1.5 text-[11px] text-destructive shadow-sm">
          تعذَّر تشغيل التِّلاوة. تحقَّق من الاتِّصال ثمَّ أعد المحاولة.
        </p>
      ) : null}

      <audio
        ref={audioRef}
        preload="none"
        onEnded={advance}
        onError={() => {
          // Clearing the source on stop is not a failure.
          if (audioRef.current?.getAttribute('src')) {
            setStatus(objectUrlRef.current ? 'error' : 'offline');
          }
        }}
        className="hidden"
      />
    </section>
  );
}
