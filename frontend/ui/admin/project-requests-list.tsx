'use client';

import { useState } from 'react';
import {
  Briefcase,
  Clock,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Wallet,
} from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { formatHijriDate } from '@/frontend/shared/format';
import { whatsappHref } from '@/frontend/shared/whatsapp';
import {
  PROJECT_REQUEST_BUDGET_RANGE_LABELS,
  PROJECT_REQUEST_STATUSES,
  PROJECT_REQUEST_STATUS_LABELS,
  PROJECT_REQUEST_TIMELINE_LABELS,
  PROJECT_REQUEST_TYPE_LABELS,
  type ProjectRequest,
  type ProjectRequestStatus,
} from '@/shared/contracts/project-requests';

const STATUS_TONES: Record<ProjectRequestStatus, string> = {
  new: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  contacted: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  quoted: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  won: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  lost: 'border-border/60 bg-muted/50 text-muted-foreground',
};

interface ProjectRequestsListProps {
  requests: ProjectRequest[];
  loading: boolean;
  savingId: string | null;
  onSave: (id: string, input: { status: ProjectRequestStatus; notes: string | null }) => void;
}

/**
 * Budget brackets and timelines are chosen from a fixed set but stored as
 * unconstrained text, so an unrecognised value falls back to itself rather than
 * rendering blank.
 */
function labelFrom(map: Record<string, string>, value: string | null): string | null {
  if (!value) return null;
  return map[value] ?? value;
}

export function ProjectRequestsList({
  requests,
  loading,
  savingId,
  onSave,
}: ProjectRequestsListProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="جارٍ تحميل الطلبات">
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
        icon={Briefcase}
        title="لا توجد طلبات بعد"
        description="ستظهر هنا كل الطلبات الواردة من صفحة طلب مشروع."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {requests.map((request) => {
        const notes = drafts[request.id] ?? request.notes ?? '';
        const isSaving = savingId === request.id;
        const notesDirty = notes.trim() !== (request.notes ?? '').trim();
        const budget = labelFrom(PROJECT_REQUEST_BUDGET_RANGE_LABELS, request.budget_range);
        const timeline = labelFrom(PROJECT_REQUEST_TIMELINE_LABELS, request.timeline);

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
                    {PROJECT_REQUEST_STATUS_LABELS[request.status]}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <code
                    dir="ltr"
                    className="block font-mono text-xs tracking-tight text-muted-foreground"
                  >
                    {request.reference_code}
                  </code>
                  <span className="text-xs font-medium text-muted-foreground">
                    {PROJECT_REQUEST_TYPE_LABELS[request.project_type]}
                  </span>
                </div>
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
                      status: value as ProjectRequestStatus,
                      notes: request.notes,
                    })
                  }
                >
                  <SelectTrigger id={`status-${request.id}`} size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_REQUEST_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {PROJECT_REQUEST_STATUS_LABELS[status]}
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
                      `مرحبًا ${request.full_name}، بخصوص طلبكم رقم ${request.reference_code}.`
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

              {request.email && (
                <div className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">البريد الإلكتروني</dt>
                  <dd className="min-w-0">
                    <a
                      href={`mailto:${request.email}`}
                      dir="ltr"
                      className="block truncate text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                    >
                      {request.email}
                    </a>
                  </dd>
                </div>
              )}

              {(budget || timeline) && (
                <div className="flex items-center gap-2">
                  <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">الميزانية والمدة</dt>
                  <dd className="text-muted-foreground">
                    {[budget, timeline].filter(Boolean).join(' · ')}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">وصف المشروع</span>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                {request.description}
              </p>
              {request.existing_url && (
                <a
                  href={request.existing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-4"
                >
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  {request.existing_url}
                </a>
              )}
            </div>

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
                placeholder="سجّل ما حدث في المتابعة: متى تمَّ التَّواصل، ماذا طُلب، وما تمَّ عرضه..."
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                }
              />
              {notesDirty && (
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
                  {isSaving ? 'جارٍ الحفظ...' : 'حفظ الملاحظات'}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
