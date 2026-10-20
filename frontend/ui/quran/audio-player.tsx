'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Pause, Play, Square } from 'lucide-react';
import { audioFileUrl, loadAudioEdition, loadSurahAudio } from '@/frontend/api/quran/audio';
import { Button } from '@/frontend/ui/primitives/button';
import type { QuranSurahAudio } from '@/shared/contracts/quran-audio';

type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface SurahAudioPlayerProps {
  surah: number;
  ayahCount: number;
  /** What the whole sura weighs, which is what it costs a reader on mobile data. */
  bytes: number;
  /** The Ayah currently playing, or null once the recitation has stopped. */
  onAyahChange?: (ayah: number | null) => void;
}

/**
 * Plays a sura's Recitation, one Ayah file after another (ADR-0062).
 *
 * The files are one Ayah each, so playback is a queue: when a file ends the next
 * one begins. That costs a small gap at each Ayah — which the reciter's own pause
 * absorbs — and buys two things a single two-hour file cannot: the Ayah being
 * played is exactly the file being played, and a reader who stops after twenty
 * ayat has paid for twenty ayat rather than for the sura.
 *
 * Nothing is fetched until play is pressed, and nothing is precached, so merely
 * reading a sura costs no audio bandwidth. The manifest arrives with the press,
 * which is also why the control can exist on a sura whose files are there and
 * simply not render on one whose are not.
 */
export function SurahAudioPlayer({ surah, ayahCount, bytes, onAyahChange }: SurahAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<QuranSurahAudio | null>(null);
  const baseUrlRef = useRef<string | null>(null);
  const positionRef = useRef(0);
  const [status, setStatus] = useState<Status>('idle');
  const [ayah, setAyah] = useState(1);

  // Leaving the sura must not leave a recitation playing behind it. The ref is
  // read at unmount, not at mount, or it would still be empty.
  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    []
  );

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
      audio.src = audioFileUrl(baseUrl, file);

      try {
        await audio.play();
        setStatus('playing');
        onAyahChange?.(file.ayah);
      } catch {
        setStatus('error');
        onAyahChange?.(null);
      }
    },
    [onAyahChange]
  );

  const prepare = useCallback(async () => {
    if (playlistRef.current) return true;

    const [playlist, edition] = await Promise.all([loadSurahAudio(surah), loadAudioEdition()]);
    if (!playlist || playlist.files.length === 0) return false;

    playlistRef.current = playlist;
    baseUrlRef.current = edition.baseUrl;
    return true;
  }, [surah]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    positionRef.current = 0;
    setAyah(1);
    onAyahChange?.(null);
    setStatus('idle');
  }, [onAyahChange]);

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
        setStatus('error');
      }
      return;
    }

    const from = status === 'error' ? 0 : positionRef.current;
    setStatus('loading');
    try {
      if (!(await prepare())) {
        setStatus('error');
        return;
      }
      await playAt(from);
    } catch {
      setStatus('error');
    }
  }, [status, prepare, playAt]);

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
        : status === 'error'
          ? 'إعادة المحاولة'
          : 'استمع للسُّورة';
  const Icon = isPlaying ? Pause : isBusy ? Loader2 : status === 'error' ? AlertTriangle : Play;

  return (
    <section
      aria-label="تلاوة السُّورة"
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
          if (audioRef.current?.getAttribute('src')) setStatus('error');
        }}
        className="hidden"
      />
    </section>
  );
}
