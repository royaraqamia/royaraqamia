'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { getMyNewsSourceRequests, submitNewsSourceRequest } from '@/frontend/api/news';
import { useSession } from '@/frontend/state/session-provider';
import { ApiError } from '@/frontend/transport/http';
import { Badge } from '@/frontend/ui/primitives/badge';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Input } from '@/frontend/ui/primitives/input';
import {
  NEWS_SOURCE_URL_MAX,
  type NewsSourceRequest,
  type NewsSourceRequestFailure,
  type NewsSourceRequestStatus,
} from '@/shared/contracts/news';

import { ACCOUNT_NEWS_REQUEST_COPY } from './account-news-request-copy';

function statusLabel(status: NewsSourceRequestStatus): string {
  switch (status) {
    case 'resolving':
      return ACCOUNT_NEWS_REQUEST_COPY.statusResolving;
    case 'ready':
      return ACCOUNT_NEWS_REQUEST_COPY.statusReady;
    case 'needs_review':
      return ACCOUNT_NEWS_REQUEST_COPY.statusNeedsReview;
    case 'approved':
      return ACCOUNT_NEWS_REQUEST_COPY.statusApproved;
    case 'rejected':
      return ACCOUNT_NEWS_REQUEST_COPY.statusRejected;
  }
}

function failureLabel(failure: NewsSourceRequestFailure): string {
  switch (failure) {
    case 'unsupported':
      return ACCOUNT_NEWS_REQUEST_COPY.failureUnsupported;
    case 'no-feed':
      return ACCOUNT_NEWS_REQUEST_COPY.failureNoFeed;
    case 'unreachable':
      return ACCOUNT_NEWS_REQUEST_COPY.failureUnreachable;
    case 'quota':
      return ACCOUNT_NEWS_REQUEST_COPY.failureQuota;
  }
}

const STATUS_TONES = {
  resolving: 'secondary',
  ready: 'secondary',
  needs_review: 'warning',
  approved: 'success',
  rejected: 'destructive',
} as const;

/**
 * Proposing a source, and the state of what this account already proposed.
 *
 * The field takes any link — a page, a channel, a feed — because the reader is
 * not asked to know what a feed is (ADR-0105). A link that resolves becomes one
 * of the reader's own sources without a queue (ADR-0106); this list is the audit
 * trail of what they asked for and what the system made of it.
 */
export function NewsSourceRequestForm() {
  const { user } = useSession();
  const [requests, setRequests] = useState<NewsSourceRequest[]>([]);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRequests(await getMyNewsSourceRequests());
    } catch {
      // The list is a convenience; the form below still works, and a failed read
      // is retried on the next open rather than blocking the page.
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!user) return null;

  const open = requests.some((request) => request.status === 'resolving');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const request = await submitNewsSourceRequest({ url: url.trim() });
      setRequests((current) => [request, ...current]);
      setUrl('');
      toast.success(ACCOUNT_NEWS_REQUEST_COPY.received);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : ACCOUNT_NEWS_REQUEST_COPY.sendFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="news-source-request-heading"
      data-visual="source-request"
      className="space-y-4"
    >
      <div>
        <h2 id="news-source-request-heading" className="text-base font-bold text-foreground">
          {ACCOUNT_NEWS_REQUEST_COPY.title}
        </h2>
      </div>

      {open ? (
        <p className="rounded-2xl border border-border/60 bg-card/60 p-3 text-xs text-muted-foreground">
          {ACCOUNT_NEWS_REQUEST_COPY.pending}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-bold text-foreground">
              {ACCOUNT_NEWS_REQUEST_COPY.urlLabel}
            </span>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              maxLength={NEWS_SOURCE_URL_MAX}
              placeholder={ACCOUNT_NEWS_REQUEST_COPY.urlPlaceholder}
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              dir="ltr"
              required
            />
          </label>
        </div>

        <HeroCtaButton type="submit" disabled={submitting}>
          {submitting ? ACCOUNT_NEWS_REQUEST_COPY.submitBusy : ACCOUNT_NEWS_REQUEST_COPY.submit}
        </HeroCtaButton>
      </form>

      {!loading && requests.length > 0 ? (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li
              key={request.id}
              className="rounded-2xl border border-border/50 bg-card/60 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-foreground">{request.name}</span>
                <Badge variant={STATUS_TONES[request.status]}>{statusLabel(request.status)}</Badge>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground" dir="ltr">
                {request.url}
              </p>
              {request.status === 'needs_review' && request.failure ? (
                <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                  {failureLabel(request.failure)}
                </p>
              ) : null}
              {request.resolvedUrl && request.resolvedUrl !== request.url ? (
                <p className="mt-1 truncate text-[11px] text-muted-foreground" dir="ltr">
                  {request.resolvedUrl}
                </p>
              ) : null}
              {request.note ? (
                <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{request.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
