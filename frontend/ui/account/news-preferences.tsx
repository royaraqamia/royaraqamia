'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Newspaper, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { getNewsSourceSelection, saveNewsSourceSelection } from '@/frontend/api/news';
import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { Button } from '@/frontend/ui/primitives/button';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { ApiError } from '@/frontend/transport/http';
import {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  NEWS_PERSONAL_DIGEST_COST,
  NEWS_PERSONAL_DIGEST_MIN_STORIES,
  NEWS_PERSONAL_MIN_STORIES,
  NEWS_REGION_LABELS,
  type NewsSource,
} from '@/shared/contracts/news';

/**
 * The reader's source checklist for `/news`.
 *
 * The selection filters the one shared digest; it never changes what the agent
 * fetches (ADR-0076). An empty selection and a full one are the same thing, so
 * the picker starts fully ticked and saves "everything" as an empty list — that
 * way a source approved next week is visible without the reader revisiting this
 * page.
 *
 * Deliberately not optimistic: the checklist is the whole document, and showing
 * it as saved before the server said so is how a reader loses a preference they
 * clicked.
 */
export function NewsPreferences() {
  const { user, isLoading: sessionLoading } = useSession();
  const [sources, setSources] = useState<NewsSource[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [personalEnabled, setPersonalEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await getNewsSourceSelection();
      setSources(result.sources);
      setPersonalEnabled(result.personalEnabled);
      // "Everything" is stored as an empty list; the picker shows it as all
      // ticked, because that is what the reader sees on /news.
      const kept = result.selected.length > 0 ? result.selected : result.sources.map((s) => s.id);
      setSelected(new Set(kept));
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : 'تعذّر تحميل مصادر الأخبار. أعد المحاولة.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (sessionLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل المصادر">
        <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
          <Lock size={20} aria-hidden="true" />
        </div>
        <p className="text-sm leading-7 text-muted-foreground">
          اختيار المصادر يتبع حسابك. سجِّل الدُّخول لاختيار ما تقرأه من المصادر على صفحة الأخبار.
        </p>
        <SignInCta href="/auth/login?redirect=/account/news" />
      </section>
    );
  }

  const allSelected = sources !== null && selected.size === sources.length;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    if (sources) setSelected(new Set(sources.map((source) => source.id)));
  };

  const save = async () => {
    if (!sources) return;
    setSaving(true);

    try {
      // All ticked is "everything", stored as an empty list so sources approved
      // later are included by default.
      await saveNewsSourceSelection(allSelected ? [] : [...selected], personalEnabled);
      toast.success(
        personalEnabled
          ? 'حفظنا اختيارك. سيُنشأ مُلخَّصك الخاص صباحًا بعد المُلخَّص العام.'
          : allSelected
            ? 'سترى كل المصادر من الآن.'
            : 'حفظنا اختيارك. ستعرض الأخبار هذه المصادر.'
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'تعذّر حفظ اختيارك. أعد المحاولة.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل المصادر">
        <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="rounded-2xl border border-border/60 bg-card/85 p-6 text-center text-sm text-muted-foreground">
        {loadError}{' '}
        <button
          type="button"
          onClick={() => void load()}
          className="font-bold text-primary underline-offset-4 hover:underline"
        >
          إعادة المحاولة
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-7 text-muted-foreground">
        اختر المصادر التي تريد أن تقرأ أخبارها. هذا الاختيار يرشِّح المُلخَّص العام ولا يغيِّر ما
        يجمعه المحرِّر. وإذا ترك اختيارك في يوم ما أقل من {NEWS_PERSONAL_MIN_STORIES} أخبار، عرضنا
        لك المُلخَّص كاملًا.
      </p>

      {NEWS_CATEGORIES.map((category) => {
        const group = (sources ?? []).filter((source) => source.category === category);
        if (group.length === 0) return null;

        return (
          <section key={category} aria-labelledby={`news-sources-${category}`}>
            <h2
              id={`news-sources-${category}`}
              className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"
            >
              <Newspaper className="size-4 text-primary" aria-hidden="true" />
              {NEWS_CATEGORY_LABELS[category]}
            </h2>

            <div className="flex flex-col gap-2">
              {group.map((source) => {
                const checked = selected.has(source.id);

                return (
                  <button
                    key={source.id}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggle(source.id)}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-start transition-safe',
                      checked
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border/50 bg-card/60 text-muted-foreground hover:border-border'
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold">{source.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {NEWS_REGION_LABELS[source.region]}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/70 bg-background'
                      )}
                      aria-hidden="true"
                    >
                      {checked ? <Check className="size-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={saving} size="sm">
          {saving ? 'جاري الحفظ…' : 'حفظ الاختيار'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={saving || allSelected}
        >
          <RotateCcw aria-hidden="true" />
          اختيار كل المصادر
        </Button>
      </div>

      <section className="rounded-2xl border border-border/50 bg-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">مُلخَّص خاص بي</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              مُلخَّص يومي من مصادرك وحدها، يُنشأ صباحًا بعد المُلخَّص العام. يكفي أن يوفّر{' '}
              {NEWS_PERSONAL_DIGEST_MIN_STORIES} أخبار على الأقل، ويُخصم من رصيدك{' '}
              {NEWS_PERSONAL_DIGEST_COST} اعتمادات عند إنشائه.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={personalEnabled}
            aria-label="مُلخَّص خاص بي"
            onClick={() => setPersonalEnabled((current) => !current)}
            className={cn(
              'relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
              personalEnabled ? 'border-primary bg-primary' : 'border-border/70 bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block size-5 rounded-full bg-background shadow-sm transition-transform',
                personalEnabled ? 'translate-x-1' : '-translate-x-5'
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </section>
    </div>
  );
}
