'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Trash } from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteNewsPrivateSource,
  deleteNewsSourceRequest,
  getMyNewsPrivateSources,
} from '@/frontend/api/news';
import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { ApiError } from '@/frontend/transport/http';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import {
  type NewsOwnedSource,
  type NewsOwnedSourceState,
  type NewsOwnedSourcesSummary,
  type NewsSourceRequestFailure,
} from '@/shared/contracts/news';

import { ACCOUNT_NEWS_PRIVATE_COPY } from './account-news-private-copy';
import { NewsSourceRequestForm } from './news-source-request';

const STATE_LABELS: Record<NewsOwnedSourceState, string> = {
  resolving: ACCOUNT_NEWS_PRIVATE_COPY.statusResolving,
  ready: ACCOUNT_NEWS_PRIVATE_COPY.statusReady,
  needs_review: ACCOUNT_NEWS_PRIVATE_COPY.statusNeedsReview,
  rejected: ACCOUNT_NEWS_PRIVATE_COPY.statusRejected,
  live: ACCOUNT_NEWS_PRIVATE_COPY.statusLive,
  broken: ACCOUNT_NEWS_PRIVATE_COPY.statusBroken,
};

const STATE_TONES = {
  resolving: 'secondary',
  ready: 'secondary',
  needs_review: 'warning',
  rejected: 'destructive',
  live: 'success',
  broken: 'destructive',
} as const;

const FAILURE_LABELS: Record<NewsSourceRequestFailure, string> = {
  unsupported: ACCOUNT_NEWS_PRIVATE_COPY.failureUnsupported,
  'no-feed': ACCOUNT_NEWS_PRIVATE_COPY.failureNoFeed,
  unreachable: ACCOUNT_NEWS_PRIVATE_COPY.failureUnreachable,
  quota: ACCOUNT_NEWS_PRIVATE_COPY.failureQuota,
};

/** Which sentence the confirmation speaks, which is the row's own situation. */
type RemoveTone = 'live' | 'pending' | 'refused';

function removeTone(state: NewsOwnedSourceState): RemoveTone {
  if (state === 'live' || state === 'broken') return 'live';
  if (state === 'rejected') return 'refused';
  return 'pending';
}

const REMOVE_COPY: Record<RemoveTone, { title: string; body: string; confirm: string }> = {
  live: {
    title: ACCOUNT_NEWS_PRIVATE_COPY.removeLiveTitle,
    body: ACCOUNT_NEWS_PRIVATE_COPY.removeLiveBody,
    confirm: ACCOUNT_NEWS_PRIVATE_COPY.removeConfirm,
  },
  pending: {
    title: ACCOUNT_NEWS_PRIVATE_COPY.removePendingTitle,
    body: ACCOUNT_NEWS_PRIVATE_COPY.removePendingBody,
    confirm: ACCOUNT_NEWS_PRIVATE_COPY.removeConfirmPending,
  },
  refused: {
    title: ACCOUNT_NEWS_PRIVATE_COPY.removeRefusedTitle,
    body: ACCOUNT_NEWS_PRIVATE_COPY.removeRefusedBody,
    confirm: ACCOUNT_NEWS_PRIVATE_COPY.removeConfirm,
  },
};

/**
 * The feeds this account added for itself, and the links still on their way
 * (ADR-0106, ADR-0130).
 *
 * One list on purpose: a reader has one relationship with these links, and the
 * page used to show the same link twice — once as a proposal with its status and
 * once as a feed with its health. The row is the request until the resolver
 * accepts it, then it is the feed, so a reader sees "جاري التحقّق", "مرفوض",
 * "يعمل" and "توقّف عن العمل" in the same place. The one thing that differs is
 * what a delete does: a feed stops being fetched, a request is cancelled.
 *
 * The digest that reads these feeds is on for every account, so nothing here
 * asks the reader to switch anything on.
 */
export function NewsPrivateSources() {
  const { user } = useSession();
  const [summary, setSummary] = useState<NewsOwnedSourcesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<NewsOwnedSource | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      setSummary(await getMyNewsPrivateSources());
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : ACCOUNT_NEWS_PRIVATE_COPY.loadFailed
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await read();
    setLoading(false);
  }, [read]);

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

  const rows = summary?.rows ?? [];
  const cap = summary?.cap ?? 0;
  const used = summary?.used ?? 0;

  const confirmRemove = async (row: NewsOwnedSource) => {
    setBusyId(row.id);
    try {
      if (row.kind === 'source') {
        await deleteNewsPrivateSource(row.id);
        toast.success(ACCOUNT_NEWS_PRIVATE_COPY.removedSource);
      } else {
        await deleteNewsSourceRequest(row.id);
        toast.success(ACCOUNT_NEWS_PRIVATE_COPY.removedRequest);
      }
      setRemoving(null);
      // The ceiling counts a pending row, so the list is read back rather than
      // patched: the server already knows what the slot and the rows are now.
      await read();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : ACCOUNT_NEWS_PRIVATE_COPY.removeFailed
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby="news-private-sources-heading"
      data-visual="private-sources"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="news-private-sources-heading" className="text-base font-bold text-foreground">
            {ACCOUNT_NEWS_PRIVATE_COPY.heading}
          </h2>
        </div>

        {summary?.limited ? (
          <Badge variant={used >= cap ? 'warning' : 'secondary'}>
            <span className="font-digits" dir="ltr">
              {used} / {cap}
            </span>
          </Badge>
        ) : null}
      </div>

      <NewsSourceRequestForm onSubmitted={() => void read()} />

      {rows.length === 0 ? (
        <p
          data-visual="private-empty"
          className="rounded-2xl border border-border/50 bg-card/60 p-4 text-sm text-muted-foreground"
        >
          {ACCOUNT_NEWS_PRIVATE_COPY.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 p-3 text-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold text-foreground">{row.name}</span>
                <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                  {row.url}
                </span>
                {row.resolvedUrl && row.resolvedUrl !== row.url ? (
                  <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                    {row.resolvedUrl}
                  </span>
                ) : null}
                {row.state === 'needs_review' && row.failure ? (
                  <span className="mt-1 text-xs leading-6 text-muted-foreground">
                    {FAILURE_LABELS[row.failure]}
                  </span>
                ) : null}
                {row.state === 'rejected' && row.note ? (
                  <span className="mt-1 text-xs leading-6 text-muted-foreground">{row.note}</span>
                ) : null}
              </span>

              <span className="flex items-center gap-2">
                <Badge
                  variant={STATE_TONES[row.state]}
                  className={cn(row.state === 'broken' && 'cursor-help')}
                  title={row.state === 'broken' ? (row.lastError ?? undefined) : undefined}
                >
                  {STATE_LABELS[row.state]}
                </Badge>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={ACCOUNT_NEWS_PRIVATE_COPY.removeAria.replace('{name}', row.name)}
                  onClick={() => setRemoving(row)}
                  disabled={busyId === row.id}
                >
                  <Trash aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {rows.some((row) => row.state === 'broken') ? (
        <p className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-6 text-muted-foreground">
          <Link2 className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          {ACCOUNT_NEWS_PRIVATE_COPY.brokenNotice}
        </p>
      ) : null}

      <Dialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
      >
        <DialogContent
          hideClose
          className="sm:max-w-md w-[calc(100%-2rem)] mx-auto p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-border/80 bg-background shadow-2xl"
          onEscapeKeyDown={() => setRemoving(null)}
        >
          {removing ? (
            <>
              <DialogHeader className="space-y-0 pe-0">
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {REMOVE_COPY[removeTone(removing.state)].title}
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {REMOVE_COPY[removeTone(removing.state)].body}
                </DialogDescription>
              </DialogHeader>

              <DialogActions
                onCancel={() => setRemoving(null)}
                cancelLabel={ACCOUNT_NEWS_PRIVATE_COPY.removeCancel}
                className="mt-6 sm:mt-8 pt-0"
              >
                <HeroCtaButton
                  type="button"
                  onClick={() => void confirmRemove(removing)}
                  disabled={busyId === removing.id}
                  className="w-full sm:w-auto"
                >
                  {REMOVE_COPY[removeTone(removing.state)].confirm}
                </HeroCtaButton>
              </DialogActions>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
