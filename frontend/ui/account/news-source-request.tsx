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
  NEWS_SOURCE_NAME_MAX,
  NEWS_SOURCE_REQUEST_STATUS_LABELS,
  NEWS_SOURCE_URL_MAX,
  type NewsSourceRequest,
} from '@/shared/contracts/news';

const STATUS_TONES = {
  pending: 'secondary',
  approved: 'success',
  rejected: 'destructive',
} as const;

/**
 * Proposing a feed, and the state of what this account already proposed.
 *
 * The form is closed while a request is pending — one at a time is a product
 * rule the server also enforces — and the row's status is the only record the
 * reader sees, because the decision itself is an Admin's.
 */
export function NewsSourceRequestForm() {
  const { user } = useSession();
  const [requests, setRequests] = useState<NewsSourceRequest[]>([]);
  const [name, setName] = useState('');
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

  const pending = requests.some((request) => request.status === 'pending');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const request = await submitNewsSourceRequest({ name: name.trim(), url: url.trim() });
      setRequests((current) => [request, ...current]);
      setName('');
      setUrl('');
      toast.success('أرسلنا طلبك للمراجعة.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'تعذّر إرسال الطلب. أعد المحاولة.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="news-source-request-heading" className="space-y-4">
      <div>
        <h2 id="news-source-request-heading" className="text-base font-bold text-foreground">
          أضف مصدرًا
        </h2>
        <p className="mt-1 text-sm leading-7 text-muted-foreground">
          أرسل رابط خلاصة RSS أو Atom لمصدر تثق به. نتحقَّق من الرابط، ثم يراجعه فريق الموقع قبل
          إضافته إلى قائمة المصادر.
        </p>
      </div>

      {pending ? (
        <p className="rounded-2xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
          لديك طلب قيد المراجعة. يمكنك إرسال طلب جديد بعد البتُّ فيه.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-foreground">اسم المصدر</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={NEWS_SOURCE_NAME_MAX}
                placeholder="مثال: صحيفة محليَّة"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-foreground">رابط الخلاصة</span>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                maxLength={NEWS_SOURCE_URL_MAX}
                placeholder="https://example.com/rss"
                inputMode="url"
                dir="ltr"
                required
              />
            </label>
          </div>

          <HeroCtaButton type="submit" disabled={submitting}>
            {submitting ? 'جاري الإرسال…' : 'إرسال الطلب'}
          </HeroCtaButton>
        </form>
      )}

      {!loading && requests.length > 0 ? (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li
              key={request.id}
              className="rounded-2xl border border-border/50 bg-card/60 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-foreground">{request.name}</span>
                <Badge variant={STATUS_TONES[request.status]}>
                  {NEWS_SOURCE_REQUEST_STATUS_LABELS[request.status]}
                </Badge>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground" dir="ltr">
                {request.url}
              </p>
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
