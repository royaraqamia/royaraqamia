'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Loader2, Pause, Play, Square } from 'lucide-react';
import {
  audioPlaybackSource,
  downloadSurahAudio,
  loadPlayableSurah,
  readDownloadedSurah,
  SurahAudioDownloadError,
} from '@/frontend/api/quran/audio';
import { formatBytes } from '@/frontend/shared/format-bytes';
import { logger } from '@/frontend/shared/logger';
import { Button } from '@/frontend/ui/primitives/button';
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
 * The files are one Ayah each, so playback is a queue: when a file ends the next
 * one begins. That costs a small gap at each Ayah — which the reciter's own pause
 * absorbs — and buys two things a single two-hour file cannot: the Ayah being
 * played is exactly the file being played, and a reader who stops after twenty
 * ayat has paid for twenty ayat rather than for the sura.
 *
 * Playback prefers a copy on this device and falls back to the host, so a reader
 * on a plane and a reader on mobile data take the same code path. Nothing is
 * fetched until play or download is pressed: merely reading a sura costs no
 * audio bandwidth, and no copy exists that the reader did not ask for.
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

  const playAt = useCallback(
    async (position: number) => {
      const audio = audioRef.current;
      const file = playlistRef.current?.files[position];
      const baseUrl = baseUrlRef.current;
      if (!audio || !baseUrl || !file) {
        setStatus('idle');
        onAyahChange?.(null);
        return;
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
        return;
      }

      audio.src = source.url;

      try {
        await audio.play();
        setStatus('playing');
        onAyahChange?.(file.ayah);
      } catch {
        // A refusal to play while the device is offline is a state to name, not
        // a failure: the Ayah it wanted is on the host, and the host is away.
        setStatus(source.local ? 'error' : 'offline');
        onAyahChange?.(null);
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
      await playAt(from);
    } catch {
      setStatus('offline');
    }
  }, [status, prepare, playAt]);

  const advance = useCallback(() => {
    const total = playlistRef.current?.files.length ?? 0;
    const next = positionRef.current + 1;
    if (next < total) void playAt(next);
    else stop();
  }, [playAt, stop]);

  /**
   * Downloads this Surah, asking first on a connection the browser calls
   * metered. `confirmed` is the reader's second press, which is the whole
   * difference between "downloaded without asking" and consent.
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
  const saveable = saved === null || saved === 'none' || saved === 'partial';

  return (
    <section
      aria-label="تلاوة السُّورة"
      // What this device holds for the sura, once that has been read. A browser
      // test waits on it rather than guessing when hydration finished.
      data-audio-state={saved ?? 'unknown'}
      className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">تلاوة السُّورة</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground" aria-live="polite">
            {isPlaying || status === 'paused' ? (
              <>
                الآية <span className="font-heading">{ayah}</span> من{' '}
                <span className="font-heading">{ayahCount}</span>
              </>
            ) : (
              <>
                <span className="font-heading">{ayahCount}</span> آيات ·{' '}
                <span className="font-heading">{Math.max(1, Math.round(bytes / 1024))}</span> ك.ب
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {(isPlaying || status === 'paused') && (
            <button
              type="button"
              onClick={stop}
              aria-label="إيقاف التِّلاوة"
              title="إيقاف التِّلاوة"
              className="inline-flex size-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-safe hover:border-border/90 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Square aria-hidden="true" className="size-3.5" />
            </button>
          )}
          <Button
            type="button"
            variant="hero"
            size="sm"
            onClick={() => void toggle()}
            disabled={isBusy}
            className="gap-1.5 px-4 text-xs font-bold"
          >
            <Icon aria-hidden="true" className={`size-3.5 ${isBusy ? 'animate-spin' : ''}`} />
            {label}
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2">
        {saved === 'complete' ? (
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
            <Check aria-hidden="true" className="size-3.5" />
            محفوظة على هذا الجُهاز، تعمل دون اتِّصال
          </p>
        ) : download.phase === 'working' ? (
          <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            جاري الحفظ… <span className="font-heading">{download.done}</span> من{' '}
            <span className="font-heading">{download.total}</span>
          </p>
        ) : (
          saveable && (
            <button
              type="button"
              onClick={() => void startDownload(false)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground transition-safe hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Download aria-hidden="true" className="size-3.5" />
              حفظ التِّلاوة{size ? ` (${size})` : ''}
            </button>
          )
        )}

        {saved === 'partial' && download.phase !== 'working' && (
          <p className="text-[11px] text-muted-foreground">بعض آياتها محفوظة فقط</p>
        )}
      </div>

      {download.phase === 'metered' && (
        <p className="mt-2 text-xs text-muted-foreground">
          أنت على اتِّصال مدفوع. الحفظ ينزّل التِّلاوة كاملة:{' '}
          <button
            type="button"
            onClick={() => void startDownload(true)}
            className="font-bold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            احفظ على أي حال
          </button>
        </p>
      )}

      {download.phase === 'unsupported' && (
        <p className="mt-2 text-xs text-destructive">
          تعذَّر حفظ التِّلاوة على هذا الجُهاز، ويمكنك الاستماع إليها بالاتِّصال.
        </p>
      )}

      {download.phase === 'failed' && (
        <p className="mt-2 text-xs text-destructive">
          لم يكتمل الحفظ. تحقَّق من الاتِّصال ثمَّ أعد المحاولة.
        </p>
      )}

      {status === 'offline' && (
        <p className="mt-2 text-xs text-destructive">
          هذه السُّورة غير محفوظة على هذا الجُهاز، وتحتاج اتِّصالًا لتشغيلها.
        </p>
      )}

      {status === 'error' && (
        <p className="mt-2 text-xs text-destructive">
          تعذَّر تشغيل التِّلاوة. تحقَّق من الاتِّصال ثمَّ أعد المحاولة.
        </p>
      )}

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
