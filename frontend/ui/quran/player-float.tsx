'use client';

import { useEffect } from 'react';
import { AlertTriangle, Check, Loader2, Pause, Play, Square } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useQuranPlayer } from '@/frontend/state/quran/player-context';
import { usePlayerLift } from './player-lift';

interface PlayerFloatProps {
  surah: number;
  ayahCount: number;
}

/**
 * The reader's recitation control (ADR-0083), now a view of the document's one
 * player rather than its owner.
 *
 * On its own sura it is play/pause, stop and the Ayah being played. On another
 * sura's page it is only "listen to this one": the sound already playing belongs
 * to the mini player beneath it, and this float must not pretend otherwise.
 */
export function PlayerFloat({ surah, ayahCount }: PlayerFloatProps) {
  const { state, saved, keep, actions } = useQuranPlayer();
  const liftRef = usePlayerLift<HTMLElement>('float');
  const isActive = state.surah === surah;
  const isPlaying = isActive && state.status === 'playing';
  const isPaused = isActive && state.status === 'paused';
  const isBusy = isActive && state.status === 'loading';
  const isFaulted = isActive && (state.status === 'error' || state.status === 'offline');
  /** The mini player is showing the sura that is actually playing. */
  const barVisible = state.surah !== null && state.surah !== surah;

  const savedState = saved[surah];
  const keepState = keep[surah];

  // The reader opens on a sura this device may already hold; the mini player is
  // not on the page, so the float is the only place that can say so.
  useEffect(() => {
    actions.refreshSaved(surah, ayahCount);
  }, [actions, surah, ayahCount]);

  const label = isPlaying
    ? 'إيقاف مؤقّت'
    : isPaused
      ? 'متابعة'
      : isBusy
        ? 'جاري التَّحميل…'
        : isFaulted
          ? 'إعادة المحاولة'
          : 'استمع للسُّورة';

  const Icon = isPlaying ? Pause : isBusy ? Loader2 : isFaulted ? AlertTriangle : Play;

  const onPrimary = () => {
    if (!isActive) {
      void actions.play(surah);
      return;
    }
    void actions.toggle();
  };

  const showCounter = isPlaying || isPaused;

  return (
    <section
      ref={liftRef}
      aria-label="تلاوة السُّورة"
      // What this device holds for the sura, once that has been read. A browser
      // test waits on it rather than guessing when hydration finished.
      data-audio-state={savedState ?? 'unknown'}
      className={cn(
        'fixed inset-e-4 z-40 flex w-fit max-w-[calc(100vw-2rem)] flex-col items-end gap-1.5',
        barVisible
          ? 'bottom-[calc(6.5rem+var(--roy-safe-bottom))]'
          : 'bottom-[calc(3.5rem+var(--roy-safe-bottom))]'
      )}
    >
      <div className="flex items-center gap-2">
        {isPlaying || isPaused ? (
          <button
            type="button"
            onClick={() => actions.stop()}
            aria-label="إيقاف التِّلاوة"
            title="إيقاف التِّلاوة"
            className="inline-flex size-11 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-md shadow-foreground/10 transition-safe hover:border-border hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Square aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onPrimary}
          disabled={isBusy}
          aria-label={label}
          title={label}
          className="inline-flex size-14 items-center justify-center rounded-full border border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)] transition-safe hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 hover:shadow-[0_15px_35px_-5px_rgba(147,51,234,0.7)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          <Icon aria-hidden="true" className={cn('size-6', isBusy && 'animate-spin')} />
        </button>
      </div>

      {showCounter ? (
        <p
          aria-live="polite"
          className="rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          الآية <span className="font-heading">{state.ayah}</span> من{' '}
          <span className="font-heading">{ayahCount}</span>
        </p>
      ) : null}

      {keepState?.phase === 'working' ? (
        <p
          aria-live="polite"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          جاري الحفظ… <span className="font-heading">{keepState.done}</span> من{' '}
          <span className="font-heading">{keepState.total}</span>
        </p>
      ) : savedState === 'complete' ? (
        <p className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-bold text-primary shadow-sm">
          <Check aria-hidden="true" className="size-3" />
          محفوظة على هذا الجُهاز، تعمل دون اتِّصال
        </p>
      ) : savedState === 'partial' ? (
        <p className="rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
          بعض آياتها محفوظة فقط
        </p>
      ) : isActive && state.status === 'offline' ? (
        <p className="max-w-64 rounded-xl border border-border/60 bg-card px-3 py-1.5 text-[11px] text-destructive shadow-sm">
          هذه السُّورة غير محفوظة على هذا الجُهاز، وتحتاج اتِّصالًا لتشغيلها.
        </p>
      ) : isActive && state.status === 'error' ? (
        <p className="max-w-64 rounded-xl border border-border/60 bg-card px-3 py-1.5 text-[11px] text-destructive shadow-sm">
          تعذَّر تشغيل التِّلاوة. تحقَّق من الاتِّصال ثمَّ أعد المحاولة.
        </p>
      ) : null}
    </section>
  );
}
