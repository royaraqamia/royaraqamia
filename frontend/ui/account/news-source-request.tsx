'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { submitNewsSourceRequest } from '@/frontend/api/news';
import { useSession } from '@/frontend/state/session-provider';
import { ApiError } from '@/frontend/transport/http';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { Input } from '@/frontend/ui/primitives/input';
import { NEWS_SOURCE_URL_MAX } from '@/shared/contracts/news';

import { ACCOUNT_NEWS_REQUEST_COPY } from './account-news-request-copy';

/**
 * Proposing a source (ADR-0105).
 *
 * The field takes any link — a page, a channel, a feed — because the reader is
 * not asked to know what a feed is. A link that resolves becomes one of the
 * reader's own sources without a queue; the list this form sits above is the one
 * place its state is shown (ADR-0130), so submitting only files the link and
 * asks that list to read itself again.
 */
export function NewsSourceRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const { user } = useSession();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      await submitNewsSourceRequest({ url: url.trim() });
      setUrl('');
      toast.success(ACCOUNT_NEWS_REQUEST_COPY.received);
      onSubmitted();
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
      className="space-y-3"
    >
      <div>
        <h3 id="news-source-request-heading" className="text-sm font-bold text-foreground">
          {ACCOUNT_NEWS_REQUEST_COPY.title}
        </h3>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1.5">
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

        <HeroCtaButton type="submit" disabled={submitting}>
          {submitting ? ACCOUNT_NEWS_REQUEST_COPY.submitBusy : ACCOUNT_NEWS_REQUEST_COPY.submit}
        </HeroCtaButton>
      </form>
    </section>
  );
}
