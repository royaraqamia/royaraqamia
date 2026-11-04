'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Trash } from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteNewsPrivateSource,
  enableMyPersonalDigest,
  getMyNewsPrivateSources,
} from '@/frontend/api/news';
import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { ApiError } from '@/frontend/transport/http';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import {
  type NewsPrivateSourceStatus,
  type NewsPrivateSourcesSummary,
} from '@/shared/contracts/news';

import { ACCOUNT_NEWS_PRIVATE_COPY } from './account-news-private-copy';

function statusLabel(status: NewsPrivateSourceStatus): string {
  return status === 'broken'
    ? ACCOUNT_NEWS_PRIVATE_COPY.statusBroken
    : ACCOUNT_NEWS_PRIVATE_COPY.statusReady;
}

/**
 * The feeds this account added for itself (ADR-0106).
 *
 * A private source is not in the catalogue: only this reader's personal digest
 * reads it, so the list is also the only place its health is visible. A source
 * the fetch could not reach three times in a row is `broken` — the fetch stops,
 * and the fix is to add the feed again or remove it.
 */
export function NewsPrivateSources() {
  const { user } = useSession();
  const [summary, setSummary] = useState<NewsPrivateSourcesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [enablingDigest, setEnablingDigest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      setSummary(await getMyNewsPrivateSources());
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : ACCOUNT_NEWS_PRIVATE_COPY.loadFailed
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!user) return null;

  if (loading) {
    return (
      <div
        className="space-y-2"
        aria-busy="true"
        aria-label={ACCOUNT_NEWS_PRIVATE_COPY.loadingLabel}
      >
        <div className="h-14 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="h-14 rounded-2xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="rounded-2xl border border-border/60 bg-card/85 p-4 text-center text-sm text-muted-foreground">
        {loadError}{' '}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded font-bold text-primary underline-offset-4 hover:underline focus-ring"
        >
          {ACCOUNT_NEWS_PRIVATE_COPY.retry}
        </button>
      </p>
    );
  }

  const sources = summary?.sources ?? [];
  const cap = summary?.cap ?? 0;
  const used = summary?.used ?? 0;

  const enableDigest = async () => {
    setEnablingDigest(true);
    try {
      setSummary(await enableMyPersonalDigest());
      toast.success(ACCOUNT_NEWS_PRIVATE_COPY.enableSucceeded);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : ACCOUNT_NEWS_PRIVATE_COPY.enableFailed
      );
    } finally {
      setEnablingDigest(false);
    }
  };

  const remove = async (id: string) => {
    setRemovingId(id);
    try {
      await deleteNewsPrivateSource(id);
      setSummary((current) =>
        current
          ? {
              ...current,
              sources: current.sources.filter((source) => source.id !== id),
              used: Math.max(0, current.used - 1),
            }
          : current
      );
      toast.success(ACCOUNT_NEWS_PRIVATE_COPY.removed);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : ACCOUNT_NEWS_PRIVATE_COPY.removeFailed
      );
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section
      aria-labelledby="news-private-sources-heading"
      data-visual="private-sources"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="news-private-sources-heading" className="text-base font-bold text-foreground">
            {ACCOUNT_NEWS_PRIVATE_COPY.heading}
          </h2>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            {ACCOUNT_NEWS_PRIVATE_COPY.body}
          </p>
        </div>

        {summary?.limited ? (
          <Badge variant={used >= cap ? 'warning' : 'secondary'}>
            <span className="font-digits" dir="ltr">
              {used} / {cap}
            </span>
          </Badge>
        ) : null}
      </div>

      {sources.length > 0 && !summary?.personalEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs leading-6 text-muted-foreground">
            {ACCOUNT_NEWS_PRIVATE_COPY.enableTitle}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => void enableDigest()}
            disabled={enablingDigest}
          >
            {enablingDigest
              ? ACCOUNT_NEWS_PRIVATE_COPY.enableBusy
              : ACCOUNT_NEWS_PRIVATE_COPY.enable}
          </Button>
        </div>
      ) : null}

      {sources.length === 0 ? (
        <p
          data-visual="private-empty"
          className="rounded-2xl border border-border/50 bg-card/60 p-4 text-sm text-muted-foreground"
        >
          {ACCOUNT_NEWS_PRIVATE_COPY.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 p-3 text-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold text-foreground">{source.name}</span>
                <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                  {source.url}
                </span>
              </span>

              <span className="flex items-center gap-2">
                <Badge
                  variant={source.status === 'broken' ? 'destructive' : 'success'}
                  className={cn(source.status === 'broken' && 'cursor-help')}
                  title={source.status === 'broken' ? (source.lastError ?? undefined) : undefined}
                >
                  {statusLabel(source.status)}
                </Badge>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={ACCOUNT_NEWS_PRIVATE_COPY.removeAria.replace('{name}', source.name)}
                  onClick={() => void remove(source.id)}
                  disabled={removingId === source.id}
                >
                  <Trash aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {sources.some((source) => source.status === 'broken') ? (
        <p className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-6 text-muted-foreground">
          <Link2 className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          {ACCOUNT_NEWS_PRIVATE_COPY.brokenNotice}
        </p>
      ) : null}
    </section>
  );
}
