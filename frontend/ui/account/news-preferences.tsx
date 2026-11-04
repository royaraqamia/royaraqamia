'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Newspaper } from 'lucide-react';
import { toast } from 'sonner';

import { getNewsSourceSelection, saveNewsSourceSelection } from '@/frontend/api/news';
import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { Button } from '@/frontend/ui/primitives/button';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { ApiError } from '@/frontend/transport/http';
import {
  NEWS_CATEGORIES,
  NEWS_PERSONAL_DIGEST_COST,
  NEWS_PERSONAL_DIGEST_MIN_STORIES,
  type NewsCategory,
  type NewsRegion,
  type NewsSource,
} from '@/shared/contracts/news';

import { ACCOUNT_NEWS_PREFERENCES_COPY } from './account-news-preferences-copy';

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  tech: ACCOUNT_NEWS_PREFERENCES_COPY.categoryTech,
  politics: ACCOUNT_NEWS_PREFERENCES_COPY.categoryPolitics,
  religion: ACCOUNT_NEWS_PREFERENCES_COPY.categoryReligion,
  economy: ACCOUNT_NEWS_PREFERENCES_COPY.categoryEconomy,
  world: ACCOUNT_NEWS_PREFERENCES_COPY.categoryWorld,
  other: ACCOUNT_NEWS_PREFERENCES_COPY.categoryOther,
};

const REGION_LABELS: Record<NewsRegion, string> = {
  arab: ACCOUNT_NEWS_PREFERENCES_COPY.regionArab,
  islamic: ACCOUNT_NEWS_PREFERENCES_COPY.regionIslamic,
  world: ACCOUNT_NEWS_PREFERENCES_COPY.regionWorld,
};

function personalBody(): string {
  return ACCOUNT_NEWS_PREFERENCES_COPY.personalBody
    .replace('{min}', String(NEWS_PERSONAL_DIGEST_MIN_STORIES))
    .replace('{cost}', String(NEWS_PERSONAL_DIGEST_COST));
}

function PageHeading() {
  return (
    <header data-visual="title" className="mb-10 text-center">
      <SectionTitle as="h1">
        <SectionTitleHighlight>{ACCOUNT_NEWS_PREFERENCES_COPY.pageTitle}</SectionTitleHighlight>
      </SectionTitle>
    </header>
  );
}

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
        error instanceof ApiError ? error.message : ACCOUNT_NEWS_PREFERENCES_COPY.loadFailed
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
      <div className="space-y-6">
        <PageHeading />
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label={ACCOUNT_NEWS_PREFERENCES_COPY.loadingLabel}
        >
          <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
          <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
          <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
            <Lock size={20} aria-hidden="true" />
          </div>
          <p className="text-sm leading-7 text-muted-foreground">
            {ACCOUNT_NEWS_PREFERENCES_COPY.signInBody}
          </p>
          <SignInCta href="/auth/login?redirect=/account/news">
            {ACCOUNT_NEWS_PREFERENCES_COPY.signIn}
          </SignInCta>
        </section>
      </div>
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
          ? ACCOUNT_NEWS_PREFERENCES_COPY.savedPersonal
          : allSelected
            ? ACCOUNT_NEWS_PREFERENCES_COPY.savedAll
            : ACCOUNT_NEWS_PREFERENCES_COPY.savedSelected
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : ACCOUNT_NEWS_PREFERENCES_COPY.saveFailed
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label={ACCOUNT_NEWS_PREFERENCES_COPY.loadingLabel}
        >
          <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
          <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
          <div className="h-10 rounded-2xl bg-muted/50 animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <p className="rounded-2xl border border-border/60 bg-card/85 p-6 text-center text-sm text-muted-foreground">
          {loadError}{' '}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded font-bold text-primary underline-offset-4 hover:underline focus-ring"
          >
            {ACCOUNT_NEWS_PREFERENCES_COPY.retry}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading />

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
              {CATEGORY_LABELS[category]}
            </h2>

            <div className="flex flex-col gap-2">
              {group.map((source, index) => {
                const checked = selected.has(source.id);

                return (
                  <button
                    key={source.id}
                    type="button"
                    aria-pressed={checked}
                    data-visual={index === 0 ? 'source-row' : undefined}
                    onClick={() => toggle(source.id)}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-start transition-safe focus-ring',
                      checked
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border/50 bg-card/60 text-muted-foreground hover:border-border'
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold">{source.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {REGION_LABELS[source.region]}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border',
                        checked
                          ? 'border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-[0_6px_16px_-8px_rgba(147,51,234,0.6)]'
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
        <HeroCtaButton type="button" onClick={() => void save()} disabled={saving}>
          {saving ? ACCOUNT_NEWS_PREFERENCES_COPY.saveBusy : ACCOUNT_NEWS_PREFERENCES_COPY.save}
        </HeroCtaButton>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={saving || allSelected}
        >
          <Check aria-hidden="true" />
          {ACCOUNT_NEWS_PREFERENCES_COPY.selectAll}
        </Button>
      </div>

      <section className="rounded-2xl border border-border/50 bg-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">
              {ACCOUNT_NEWS_PREFERENCES_COPY.personalTitle}
            </p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{personalBody()}</p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={personalEnabled}
            aria-label={ACCOUNT_NEWS_PREFERENCES_COPY.personalTitle}
            onClick={() => setPersonalEnabled((current) => !current)}
            dir="ltr"
            className={cn(
              'relative mt-1 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border px-1 transition-colors focus-ring',
              personalEnabled
                ? 'border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600'
                : 'border-border/70 bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block size-5 rounded-full bg-background shadow-sm transition-transform duration-200',
                personalEnabled ? 'translate-x-0' : 'translate-x-[18px]'
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </section>
    </div>
  );
}
