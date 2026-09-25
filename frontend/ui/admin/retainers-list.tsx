'use client';

import { useState } from 'react';
import {
  Building2,
  CalendarClock,
  Clock,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Wallet,
  Wrench,
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
import { Input } from '@/frontend/ui/primitives/input';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { formatHijriDate, hasDatePassed } from '@/frontend/shared/format';
import {
  RETAINER_NOTES_MAX,
  RETAINER_STATUSES,
  RETAINER_STATUS_LABELS,
  RetainerUpdateSchema,
  type Retainer,
  type RetainerStatus,
} from '@/shared/contracts/retainers';

const STATUS_TONES: Record<RetainerStatus, string> = {
  new: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  contacted: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  paused: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  ended: 'border-border/60 bg-muted/50 text-muted-foreground',
};

/**
 * The fields an Admin edit carries. Every field is optional because the row sends
 * only what actually changed: a whole-row payload would let a stale screen
 * overwrite a colleague's agreed fee or recorded payment.
 */
export interface RetainerRowEdit {
  status?: RetainerStatus;
  notes?: string | null;
  monthly_fee_usd?: number;
  paid_through?: string | null;
}

interface RetainersListProps {
  retainers: Retainer[];
  loading: boolean;
  savingId: string | null;
  onSave: (id: string, edit: RetainerRowEdit) => void;
}

interface RowDraft {
  notes?: string;
  fee?: string;
  paidThrough?: string;
}

/**
 * The row's reply affordance. The Reference Code is the token the Client quotes
 * and the handoff is WhatsApp, so the code travels in the prefilled message
 * rather than leaving the Admin to retype it.
 */
function whatsappHref(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

export interface RetainerDetailsEdit {
  edit: Omit<RetainerRowEdit, 'status'>;
  dirty: boolean;
  feeError: string | null;
}

/**
 * Works out what the Admin actually changed, and refuses a fee the API would
 * reject. The fee is validated with the same schema the endpoint uses, so the
 * inline message and the `400` body can never drift apart.
 */
export function buildRetainerDetailsEdit(
  retainer: Retainer,
  draft: { notes: string; fee: string; paidThrough: string }
): RetainerDetailsEdit {
  const edit: RetainerDetailsEdit['edit'] = {};

  if (draft.notes.trim() !== (retainer.notes ?? '').trim()) {
    edit.notes = draft.notes.trim() || null;
  }

  if (draft.paidThrough.trim() !== (retainer.paid_through ?? '')) {
    edit.paid_through = draft.paidThrough.trim() || null;
  }

  const fee = RetainerUpdateSchema.shape.monthly_fee_usd.safeParse(draft.fee);
  const feeValue = fee.success ? fee.data : undefined;
  const feeError = fee.success
    ? null
    : (fee.error.issues[0]?.message ?? 'الرَّسم الشَّهريّ غير صحيح');

  if (typeof feeValue === 'number' && feeValue !== retainer.monthly_fee_usd) {
    edit.monthly_fee_usd = feeValue;
  }

  return { edit, feeError, dirty: Object.keys(edit).length > 0 };
}

/**
 * `paid_through` is a date-only column, so it is anchored to local midnight
 * before formatting: parsed as UTC it would render as the previous day for
 * anyone west of Greenwich.
 */
function formatPaidThrough(value: string): string {
  return formatHijriDate(`${value}T00:00:00`);
}

export function RetainersList({ retainers, loading, savingId, onSave }: RetainersListProps) {
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="جارٍ تحميل العقود">
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

  if (retainers.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="لا توجد عقود بعد"
        description="ستظهر هنا كل الطلبات الواردة من صفحة التَّوظيف الشَّهريّ."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {retainers.map((retainer) => {
        const draft = drafts[retainer.id] ?? {};
        const notes = draft.notes ?? retainer.notes ?? '';
        const fee = draft.fee ?? String(retainer.monthly_fee_usd);
        const paidThrough = draft.paidThrough ?? retainer.paid_through ?? '';
        const isSaving = savingId === retainer.id;

        const { edit, dirty, feeError } = buildRetainerDetailsEdit(retainer, {
          notes,
          fee,
          paidThrough,
        });

        // Factual only: it marks that the recorded period is behind today, not that
        // the Client is late — collection is offline and a lag may be normal.
        const periodEnded = hasDatePassed(paidThrough);

        const updateDraft = (patch: RowDraft) =>
          setDrafts((current) => ({
            ...current,
            [retainer.id]: { ...current[retainer.id], ...patch },
          }));

        return (
          <li
            key={retainer.id}
            className="border-border/60 bg-card hover:border-primary/20 rounded-2xl border p-4 shadow-xs transition-colors sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">{retainer.full_name}</h2>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONES[retainer.status]}`}
                  >
                    {RETAINER_STATUS_LABELS[retainer.status]}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <code
                    dir="ltr"
                    className="block font-mono text-xs tracking-tight text-muted-foreground"
                  >
                    {retainer.reference_code}
                  </code>
                  {retainer.company && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                      {retainer.company}
                    </span>
                  )}
                </div>
              </div>

              <div className="w-full sm:w-48">
                <label htmlFor={`status-${retainer.id}`} className="sr-only">
                  حالة العقد
                </label>
                <Select
                  value={retainer.status}
                  disabled={isSaving}
                  onValueChange={(value) =>
                    onSave(retainer.id, { status: value as RetainerStatus })
                  }
                >
                  <SelectTrigger id={`status-${retainer.id}`} size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETAINER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {RETAINER_STATUS_LABELS[status]}
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
                      retainer.phone_whatsapp,
                      `مرحبًا ${retainer.full_name}، بخصوص طلبكم رقم ${retainer.reference_code}.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:underline underline-offset-4 dark:text-emerald-400"
                  >
                    <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {retainer.phone_whatsapp}
                  </a>
                </dd>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <dt className="sr-only">تاريخ الطَّلب</dt>
                <dd className="text-muted-foreground">{formatHijriDate(retainer.created_at)}</dd>
              </div>

              {retainer.email && (
                <div className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">البريد الإلكتروني</dt>
                  <dd className="min-w-0">
                    <a
                      href={`mailto:${retainer.email}`}
                      dir="ltr"
                      className="block truncate text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                    >
                      {retainer.email}
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">المشاريع القائمة</span>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                {retainer.current_projects}
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Wrench className="size-3.5 shrink-0" aria-hidden="true" />
                ما يحتاج صيانته
              </span>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">{retainer.needs}</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor={`fee-${retainer.id}`}
                  className="form-label inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
                  الرَّسم الشَّهريّ (دولار)
                </label>
                <Input
                  id={`fee-${retainer.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  value={fee}
                  disabled={isSaving}
                  error={feeError !== null}
                  aria-describedby={feeError ? `fee-${retainer.id}-error` : undefined}
                  onChange={(event) => updateDraft({ fee: event.target.value })}
                />
                {feeError && (
                  <p id={`fee-${retainer.id}-error`} className="form-error" role="alert">
                    {feeError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor={`paid-through-${retainer.id}`}
                  className="form-label inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                  مدفوع حتى
                </label>
                <Input
                  id={`paid-through-${retainer.id}`}
                  type="date"
                  dir="ltr"
                  value={paidThrough}
                  disabled={isSaving}
                  onChange={(event) => updateDraft({ paidThrough: event.target.value })}
                />
                <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {paidThrough ? formatPaidThrough(paidThrough) : 'لم يُسجَّل بعد'}
                  {periodEnded && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      انتهت المُدَّة
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label
                htmlFor={`notes-${retainer.id}`}
                className="form-label text-xs text-muted-foreground"
              >
                ملاحظات المتابعة
              </label>
              <Textarea
                id={`notes-${retainer.id}`}
                rows={2}
                maxLength={RETAINER_NOTES_MAX}
                value={notes}
                disabled={isSaving}
                placeholder="سجّل ما حدث في المتابعة: متى تمَّ التَّواصل، ماذا اتُّفق عليه، وما تمَّ تحصيله..."
                onChange={(event) => updateDraft({ notes: event.target.value })}
              />
              {(dirty || feeError !== null) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving || feeError !== null}
                  className="btn-hover-lift"
                  onClick={() => onSave(retainer.id, edit)}
                >
                  <Save className="size-4" aria-hidden="true" />
                  {isSaving ? 'جارٍ الحفظ...' : 'حفظ التَّفاصيل'}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
