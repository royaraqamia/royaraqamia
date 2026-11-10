'use client';

import { useState } from 'react';
import { BadgeCheck, Clock, MessageCircle, Phone, Save } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { formatHijriDate } from '@/frontend/shared/format';
import { whatsappHref } from '@/frontend/shared/whatsapp';
import {
  SUBSCRIPTION_REQUEST_STATUSES,
  SUBSCRIPTION_REQUEST_STATUS_LABELS,
  type SubscriptionRequest,
  type SubscriptionRequestStatus,
} from '@/shared/contracts/subscriptions';

const STATUS_TONES: Record<SubscriptionRequestStatus, string> = {
  new: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  contacted: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  activated: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  declined: 'border-border/60 bg-muted/50 text-muted-foreground',
};

interface SubscriptionRequestsListProps {
  requests: SubscriptionRequest[];
  loading: boolean;
  savingId: string | null;
  onSave: (id: string, input: { status: SubscriptionRequestStatus; notes: string | null }) => void;
}

/**
 * The «اشترِك الآن» requests, read the same way as the other lead books: the
 * status is the lifecycle, and the notes are the Admin's follow-up. The reader's
 * own answers are shown, never edited — the row records what was submitted.
 *
 * Activating the plan still happens in `/admin/plans`, where the grant is
 * written: this list answers "who asked", and that page answers "who has it".
 */
export function SubscriptionRequestsList({
  requests,
  loading,
  savingId,
  onSave,
}: SubscriptionRequestsListProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="جاري تحميل الطلبات">
        {[0, 1, 2].map((key) => (
          <div key={key} className="rounded-2xl border border-border/60 bg-card p-5">
            <Skeleton className="mb-3 h-5 w-48" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="لا توجد طلبات اشتراك بعد"
        description="ستظهر هنا كل الطلبات الواردة من صفحة «اشترِك الآن»."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {requests.map((request) => {
        const notes = drafts[request.id] ?? request.notes ?? '';
        const isSaving = savingId === request.id;
        const notesDirty = notes.trim() !== (request.notes ?? '').trim();

        return (
          <li
            key={request.id}
            className="border-border/60 bg-card hover:border-primary/20 rounded-2xl border p-4 shadow-xs transition-colors sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">{request.full_name}</h2>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONES[request.status]}`}
                  >
                    {SUBSCRIPTION_REQUEST_STATUS_LABELS[request.status]}
                  </span>
                </div>
                <code
                  dir="ltr"
                  className="mt-1 block font-mono text-xs tracking-tight text-muted-foreground"
                >
                  {request.reference_code}
                </code>
              </div>

              <div className="w-full sm:w-48">
                <label htmlFor={`status-${request.id}`} className="sr-only">
                  حالة الطَّلب
                </label>
                <Select
                  value={request.status}
                  disabled={isSaving}
                  onValueChange={(value) =>
                    onSave(request.id, {
                      status: value as SubscriptionRequestStatus,
                      notes: request.notes,
                    })
                  }
                >
                  <SelectTrigger id={`status-${request.id}`} size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBSCRIPTION_REQUEST_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {SUBSCRIPTION_REQUEST_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <dt className="sr-only">رقم واتساب</dt>
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <dd>
                  <a
                    href={whatsappHref(
                      request.phone_whatsapp,
                      `مرحبًا ${request.full_name}، بخصوص طلب الاشتراك رقم ${request.reference_code}.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:underline underline-offset-4 dark:text-emerald-400"
                  >
                    <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {request.phone_whatsapp}
                  </a>
                </dd>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <dt className="sr-only">تاريخ الطَّلب</dt>
                <dd className="text-muted-foreground">{formatHijriDate(request.created_at)}</dd>
              </div>
            </dl>

            <div className="mt-4 space-y-2">
              <label
                htmlFor={`notes-${request.id}`}
                className="form-label text-xs text-muted-foreground"
              >
                ملاحظات المتابعة
              </label>
              <Textarea
                id={`notes-${request.id}`}
                rows={2}
                maxLength={2000}
                value={notes}
                disabled={isSaving}
                placeholder="سجّل ما حدث في المتابعة: متى تمَّ التَّواصل، وما تمَّ الاتِّفاق عليه..."
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                }
              />
              {notesDirty ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  className="btn-hover-lift"
                  onClick={() =>
                    onSave(request.id, { status: request.status, notes: notes.trim() })
                  }
                >
                  <Save className="size-4" aria-hidden="true" />
                  {isSaving ? 'جاري الحفظ...' : 'حفظ الملاحظات'}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
