'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';

import {
  downloadSurahAudio,
  loadSurahAudio,
  SurahAudioDownloadError,
} from '@/frontend/api/quran/audio';
import { formatBytes } from '@/frontend/shared/format-bytes';
import { AUDIO_BUDGET_BYTES, audioUsageBytes } from '@/frontend/shared/local-store/audio';
import { Button } from '@/frontend/ui/primitives/button';

/**
 * Keeping more than one sura at a time (#559).
 *
 * A range rather than a "download this juz" button on purpose: the juz
 * boundaries are Quran structure, and the vendored index does not carry them, so
 * a juz action would publish a map we would be asserting from memory. A reader
 * who wants the last juz picks 78 to 114, which is the same list without the
 * claim — and the size is stated before anything is fetched, as ADR-0081
 * requires.
 *
 * The quote costs one manifest request per sura in the range. Those are small,
 * same-origin, and the player would fetch them anyway; they are not audio.
 */
interface SurahOption {
  readonly n: number;
  readonly name: string;
}

type Phase = 'idle' | 'quoting' | 'ready' | 'working' | 'metered' | 'failed' | 'done';

interface KeptRangeProps {
  /** Every sura, in the order of the text, which is how a range reads. */
  readonly surahs: readonly SurahOption[];
}

export function KeepRange({ surahs }: KeptRangeProps) {
  const first = surahs[0]?.n ?? 1;
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(first);
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<{ bytes: number; suras: number } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [remaining, setRemaining] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const selected = useMemo(() => {
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    return surahs.filter((surah) => surah.n >= low && surah.n <= high);
  }, [surahs, from, to]);

  // The range's cost, before anything is kept: the size is the manifest's own
  // figure for every Ayah, so it is what the download will actually move.
  useEffect(() => {
    let live = true;
    setQuote(null);
    setProblem(null);
    setPhase(selected.length === 0 ? 'idle' : 'quoting');

    void (async () => {
      let bytes = 0;
      let suras = 0;
      for (const surah of selected) {
        try {
          const manifest = await loadSurahAudio(surah.n);
          if (manifest && manifest.files.length > 0) {
            bytes += manifest.bytes;
            suras += 1;
          }
        } catch {
          // A manifest that cannot be read is not part of the quote; the
          // download reports it by name if it fails there too.
        }
        if (!live) return;
      }

      const usage = await audioUsageBytes().catch(() => 0);
      if (!live) return;

      setQuote({ bytes, suras });
      setRemaining(Math.max(0, AUDIO_BUDGET_BYTES - usage));
      setPhase('ready');
    })();

    return () => {
      live = false;
    };
  }, [selected]);

  const keep = useCallback(
    async (confirmed: boolean) => {
      setMessage(null);
      setProblem(null);
      setPhase('working');
      setProgress({ done: 0, total: selected.length });

      let kept = 0;
      let bytes = 0;

      for (const [index, surah] of selected.entries()) {
        try {
          const result = await downloadSurahAudio(surah.n, { allowMetered: confirmed });
          kept += 1;
          bytes += result.bytes;
        } catch (error) {
          if (
            error instanceof SurahAudioDownloadError &&
            error.refusal === 'metered' &&
            !confirmed
          ) {
            setPhase('metered');
            setProgress({ done: 0, total: 0 });
            return;
          }
          if (error instanceof SurahAudioDownloadError && error.refusal === 'unavailable') {
            setPhase('failed');
            setProblem('تعذَّر حفظ التِّلاوة على هذا الجُهاز، ويمكنك الاستماع إليها بالاتِّصال.');
            return;
          }
          setPhase('failed');
          setProblem(`لم يكتمل الحفظ عند سُورة ${surah.name}. أعد المحاولة، وسيُكمل ما بقي.`);
          return;
        }

        setProgress({ done: index + 1, total: selected.length });
      }

      const usage = await audioUsageBytes().catch(() => 0);
      setRemaining(Math.max(0, AUDIO_BUDGET_BYTES - usage));
      setMessage(
        `حُفظت ${kept} من السُّوَر${bytes > 0 ? ` (${formatBytes(bytes) ?? ''})` : ''}. تُشغَّل الآن دون اتِّصال.`
      );
      setPhase('done');
    },
    [selected]
  );

  const size = quote && quote.bytes > 0 ? formatBytes(quote.bytes) : null;
  const overBudget = quote !== null && remaining !== null && quote.bytes > remaining;
  const busy = phase === 'quoting' || phase === 'working';

  return (
    <section
      aria-labelledby="keep-range"
      className="rounded-2xl border border-border/60 bg-card/50 px-4 py-4"
    >
      <h2 id="keep-range" className="text-sm font-bold text-foreground">
        حفظ سُوَر للاستماع دون اتِّصال
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        اختر المدى ثمَّ اقرأ حجمه قبل أن يبدأ أيُّ تنزيل. لا يُحفظ شيء دون هذا الاختيار.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-bold text-muted-foreground">
          من السُّورة
          <select
            value={from}
            disabled={busy}
            onChange={(event) => setFrom(Number(event.target.value))}
            className="rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {surahs.map((surah) => (
              <option key={surah.n} value={surah.n}>
                {surah.n} · {surah.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] font-bold text-muted-foreground">
          إلى السُّورة
          <select
            value={to}
            disabled={busy}
            onChange={(event) => setTo(Number(event.target.value))}
            className="rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {surahs.map((surah) => (
              <option key={surah.n} value={surah.n}>
                {surah.n} · {surah.name}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          {phase === 'quoting' ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              جاري حساب الحجم…
            </span>
          ) : quote ? (
            <>
              <span className="font-heading">{quote.suras}</span> سُوَر ·{' '}
              <span className="font-bold text-foreground">{size ?? 'لا حجم معروف'}</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="hero"
          size="sm"
          onClick={() => void keep(false)}
          disabled={busy || phase === 'metered' || (quote?.suras ?? 0) === 0}
          className="gap-1.5 px-4 text-xs font-bold"
        >
          {phase === 'working' ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : phase === 'done' ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Save aria-hidden="true" className="size-3.5" />
          )}
          {phase === 'working'
            ? `جاري الحفظ… ${progress.done} من ${progress.total}`
            : phase === 'done'
              ? 'حُفظ المدى'
              : 'احفظ المحدَّد'}
        </Button>

        {remaining !== null && (
          <p className="text-[11px] text-muted-foreground">
            المتاح للتِّلاوة:{' '}
            <span className="font-bold text-foreground">{formatBytes(remaining) ?? 'لا شيء'}</span>
          </p>
        )}
      </div>

      {overBudget && phase === 'ready' && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-600">
          المحدَّد أكبر من المساحة المتاحة، فستُزال السُّوَر الأقدم تلقائيًّا لتفسح له.
        </p>
      )}

      {phase === 'metered' && (
        <p className="mt-2 text-xs text-muted-foreground">
          أنت على اتِّصال مدفوع. الحفظ ينزّل المدى كاملًا:{' '}
          <button
            type="button"
            onClick={() => void keep(true)}
            className="font-bold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            احفظ على أي حال
          </button>
        </p>
      )}

      {message && (
        <p role="status" aria-live="polite" className="mt-2 text-[11px] font-bold text-primary">
          {message}
        </p>
      )}

      {problem && (
        <p role="status" aria-live="polite" className="mt-2 text-[11px] text-destructive">
          {problem}
        </p>
      )}
    </section>
  );
}
