'use client';

import { useState } from 'react';
import { Clock, Mail, MessageCircle, Phone, Save, User } from 'lucide-react';
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
import {
  TRAINING_APPLICATION_STATUSES,
  TRAINING_APPLICATION_STATUS_LABELS,
  TRAINING_EXPERIENCE_LABELS,
  type TrainingApplication,
  type TrainingApplicationStatus,
} from '@/shared/contracts/training';

const STATUS_TONES: Record<TrainingApplicationStatus, string> = {
  new: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  contacted: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  enrolled: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  rejected: 'border-border/60 bg-muted/50 text-muted-foreground',
};

interface TrainingApplicationsListProps {
  applications: TrainingApplication[];
  loading: boolean;
  savingId: string | null;
  onSave: (id: string, input: { status: TrainingApplicationStatus; notes: string | null }) => void;
}

function whatsappHref(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

export function TrainingApplicationsList({
  applications,
  loading,
  savingId,
  onSave,
}: TrainingApplicationsListProps) {
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

  if (applications.length === 0) {
    return (
      <EmptyState
        icon={User}
        title="لا توجد طلبات بعد"
        description="ستظهر هنا كل الطلبات الواردة من صفحة التَّقديم على الدَّورة."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {applications.map((application) => {
        const notes = drafts[application.id] ?? application.notes ?? '';
        const isSaving = savingId === application.id;
        const notesDirty = notes.trim() !== (application.notes ?? '').trim();

        return (
          <li
            key={application.id}
            className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">{application.full_name}</h2>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONES[application.status]}`}
                  >
                    {TRAINING_APPLICATION_STATUS_LABELS[application.status]}
                  </span>
                </div>
                <code
                  dir="ltr"
                  className="mt-1 block font-mono text-xs tracking-tight text-muted-foreground"
                >
                  {application.reference_code}
                </code>
              </div>

              <div className="w-full sm:w-48">
                <label htmlFor={`status-${application.id}`} className="sr-only">
                  حالة الطَّلب
                </label>
                <Select
                  value={application.status}
                  disabled={isSaving}
                  onValueChange={(value) =>
                    onSave(application.id, {
                      status: value as TrainingApplicationStatus,
                      notes: application.notes,
                    })
                  }
                >
                  <SelectTrigger id={`status-${application.id}`} size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAINING_APPLICATION_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {TRAINING_APPLICATION_STATUS_LABELS[status]}
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
                    href={whatsappHref(application.phone_whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 font-medium text-emerald-600 hover:underline underline-offset-4 dark:text-emerald-400"
                  >
                    <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {application.phone_whatsapp}
                  </a>
                </dd>
              </div>

              {application.email && (
                <div className="flex items-center gap-2">
                  <dt className="sr-only">البريد الإلكتروني</dt>
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dd dir="ltr" className="truncate text-foreground/90">
                    <a href={`mailto:${application.email}`} className="hover:underline">
                      {application.email}
                    </a>
                  </dd>
                </div>
              )}

              <div className="flex items-center gap-2">
                <dt className="text-xs font-medium text-muted-foreground">مستوى الخبرة</dt>
                <dd className="font-medium text-foreground/90">
                  {TRAINING_EXPERIENCE_LABELS[application.experience_level]}
                </dd>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <dt className="sr-only">تاريخ الطَّلب</dt>
                <dd className="text-muted-foreground">{formatHijriDate(application.created_at)}</dd>
              </div>
            </dl>

            {application.goal && (
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-3">
                <span className="text-xs font-medium text-muted-foreground">ما يريد بناءه</span>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                  {application.goal}
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <label
                htmlFor={`notes-${application.id}`}
                className="form-label text-xs text-muted-foreground"
              >
                ملاحظات المتابعة
              </label>
              <Textarea
                id={`notes-${application.id}`}
                rows={2}
                maxLength={2000}
                value={notes}
                disabled={isSaving}
                placeholder="سجّل ما حدث في المتابعة: متى تمَّ التَّواصل، ماذا طلب..."
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [application.id]: event.target.value }))
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
                    onSave(application.id, { status: application.status, notes: notes.trim() })
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
