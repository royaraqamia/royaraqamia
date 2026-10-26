'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Loader2, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useQuranPlayer } from '@/frontend/state/quran/player-context';
import { isPrimaryRoute } from '@/frontend/ui/navbar/route-kind';

/**
 * The recitation, on every page that is not its own reader.
 *
 * It is deliberately the same controls as the reader's float — play/pause, stop
 * and the Ayah being played — plus the two track skips the system controls also
 * offer. Tapping the middle opens the sura at the Ayah that is playing, which is
 * the only sensible destination for "return to what I am listening to".
 */
export function PlayerBar() {
  const pathname = usePathname();
  const { state, actions } = useQuranPlayer();

  if (state.surah === null || state.name === null) return null;

  const isPlaying = state.status === 'playing';
  const isBusy = state.status === 'loading';
  const isFaulted = state.status === 'error' || state.status === 'offline';
  const primary = isPrimaryRoute(pathname);

  const label = isPlaying
    ? 'إيقاف مؤقّت'
    : isBusy
      ? 'جاري التَّحميل…'
      : isFaulted
        ? 'إعادة المحاولة'
        : 'متابعة';

  const Icon = isPlaying ? Pause : isBusy ? Loader2 : isFaulted ? AlertTriangle : Play;

  const percent =
    state.surahDuration > 0
      ? Math.min(Math.max((state.surahPosition / state.surahDuration) * 100, 0), 100)
      : 0;

  return (
    <section
      data-quran-player-bar
      aria-label="مُشغِّل التِّلاوة"
      className={cn(
        'fixed inset-x-0 z-40 px-3 print:hidden',
        primary
          ? 'bottom-[calc(3.5rem+var(--roy-safe-bottom)+0.5rem)] lg:bottom-[calc(5.75rem+var(--roy-safe-bottom))]'
          : 'bottom-[calc(1rem+var(--roy-safe-bottom))]'
      )}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-2xl shadow-foreground/20">
        <button
          type="button"
          onClick={() => void actions.toggle()}
          disabled={isBusy}
          aria-label={label}
          title={label}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-md shadow-primary/30 transition-safe hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          <Icon aria-hidden="true" className={cn('size-4', isBusy && 'animate-spin')} />
        </button>

        <Link
          href={`/quran/${state.surah}#ayah-${state.ayah}`}
          className="min-w-0 flex-1 rounded-lg px-1 py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <p className="truncate text-xs font-bold text-foreground">سورة {state.name}</p>
          <p className="text-[10px] text-muted-foreground">
            الآية <span className="font-heading">{state.ayah}</span> من{' '}
            <span className="font-heading">{state.ayahCount}</span>
          </p>
          {state.surahDuration > 0 ? (
            <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </Link>

        <button
          type="button"
          onClick={() => actions.previous()}
          aria-label="الآية السَّابقة"
          title="الآية السَّابقة"
          className="hidden size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:inline-flex"
        >
          <SkipBack aria-hidden="true" className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => actions.next()}
          aria-label="الآية التَّالية"
          title="الآية التَّالية"
          className="hidden size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:inline-flex"
        >
          <SkipForward aria-hidden="true" className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => actions.stop()}
          aria-label="إيقاف التِّلاوة"
          title="إيقاف التِّلاوة"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Square aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </section>
  );
}
