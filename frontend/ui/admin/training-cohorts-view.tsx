'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, Pencil, Plus, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  createTrainingCohort,
  getTrainingCohorts,
  updateTrainingCohort,
} from '@/frontend/api/training';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { formatHijriDate } from '@/frontend/shared/format';
import {
  TRAINING_COHORT_CAPACITY_MAX,
  TRAINING_COHORT_DEFAULT_CAPACITY,
  TRAINING_COHORT_LABEL_MAX,
  TRAINING_COHORT_STATUSES,
  TRAINING_COHORT_STATUS_LABELS,
  TRAINING_COURSE,
  trainingCohortSeatsLeft,
  type TrainingCohort,
  type TrainingCohortStatus,
} from '@/shared/contracts/training';

interface CohortDraft {
  label: string;
  starts_at: string;
  capacity: string;
  status: TrainingCohortStatus;
}

const EMPTY_DRAFT: CohortDraft = {
  label: '',
  starts_at: '',
  capacity: String(TRAINING_COHORT_DEFAULT_CAPACITY),
  status: 'open',
};

const STATUS_TONES: Record<TrainingCohortStatus, string> = {
  open: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  closed: 'border-border/60 bg-muted/50 text-muted-foreground',
};

/** The date input is date-only; the stored timestamp is trimmed to its calendar day. */
function toDateInputValue(startsAt: string): string {
  return startsAt.slice(0, 10);
}

export function TrainingCohortsView() {
  const [cohorts, setCohorts] = useState<TrainingCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CohortDraft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setCohorts(await getTrainingCohorts());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setShowForm(true);
  }

  function startEdit(cohort: TrainingCohort) {
    setEditingId(cohort.id);
    setDraft({
      label: cohort.label,
      starts_at: toDateInputValue(cohort.starts_at),
      capacity: String(cohort.capacity),
      status: cohort.status,
    });
    setFieldErrors({});
    setShowForm(true);
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (draft.label.trim().length < 2) errors.label = 'العنوان يجب أن يكون حرفين على الأقل';

    if (!draft.starts_at) {
      errors.starts_at = 'تاريخ البدء مطلوب';
    }

    const capacity = Number(draft.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > TRAINING_COHORT_CAPACITY_MAX) {
      errors.capacity = `عدد المقاعد يجب أن يكون بين 1 و${TRAINING_COHORT_CAPACITY_MAX}`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    const payload = {
      label: draft.label.trim(),
      starts_at: draft.starts_at,
      capacity: Number(draft.capacity),
      status: draft.status,
    };

    setSaving(true);
    const result = editingId
      ? await updateTrainingCohort(editingId, payload)
      : await createTrainingCohort({ course_slug: TRAINING_COURSE.slug, ...payload });
    setSaving(false);

    if (result.success) {
      toast.success(editingId ? 'تم تحديث الدُّفعة' : 'تمت إضافة الدُّفعة');
      setShowForm(false);
      void refresh();
    } else {
      toast.error(result.error ?? 'تعذّر حفظ الدُّفعة');
    }
  }

  async function toggleStatus(cohort: TrainingCohort) {
    const next: TrainingCohortStatus = cohort.status === 'open' ? 'closed' : 'open';
    setTogglingId(cohort.id);
    const result = await updateTrainingCohort(cohort.id, { status: next });
    setTogglingId(null);

    if (result.success) {
      toast.success(next === 'open' ? 'تم فتح الدُّفعة' : 'تم إغلاق الدُّفعة');
      void refresh();
    } else {
      toast.error(result.error ?? 'تعذّر تحديث حالة الدُّفعة');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs sm:text-sm">
          الدُّفعات المتاحة لدورة{' '}
          <span className="text-foreground font-bold">{TRAINING_COURSE.title}</span>
        </p>
        {showForm ? (
          <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
            <X aria-hidden="true" />
            إلغاء
          </Button>
        ) : (
          <Button type="button" onClick={startCreate}>
            <Plus aria-hidden="true" />
            دُفعة جديدة
          </Button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="border-border bg-card space-y-4 rounded-2xl border p-4 sm:p-5"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <Label htmlFor="cohort-label" required>
                عنوان الدُّفعة
              </Label>
              <Input
                id="cohort-label"
                value={draft.label}
                maxLength={TRAINING_COHORT_LABEL_MAX}
                placeholder="مثال: الدُّفعة الأولى — نوفمبر"
                error={Boolean(fieldErrors.label)}
                aria-describedby={fieldErrors.label ? 'cohort-label-error' : undefined}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, label: event.target.value }))
                }
              />
              {fieldErrors.label && (
                <p id="cohort-label-error" className="form-error">
                  {fieldErrors.label}
                </p>
              )}
            </div>

            <div className="form-field">
              <Label htmlFor="cohort-starts-at" required>
                تاريخ البدء
              </Label>
              <Input
                id="cohort-starts-at"
                type="date"
                value={draft.starts_at}
                error={Boolean(fieldErrors.starts_at)}
                aria-describedby={fieldErrors.starts_at ? 'cohort-starts-at-error' : undefined}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, starts_at: event.target.value }))
                }
              />
              {fieldErrors.starts_at && (
                <p id="cohort-starts-at-error" className="form-error">
                  {fieldErrors.starts_at}
                </p>
              )}
            </div>

            <div className="form-field">
              <Label htmlFor="cohort-capacity" required>
                عدد المقاعد
              </Label>
              <Input
                id="cohort-capacity"
                type="number"
                min={1}
                max={TRAINING_COHORT_CAPACITY_MAX}
                step={1}
                value={draft.capacity}
                error={Boolean(fieldErrors.capacity)}
                aria-describedby={fieldErrors.capacity ? 'cohort-capacity-error' : undefined}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, capacity: event.target.value }))
                }
              />
              {fieldErrors.capacity && (
                <p id="cohort-capacity-error" className="form-error">
                  {fieldErrors.capacity}
                </p>
              )}
            </div>

            <div className="form-field">
              <Label htmlFor="cohort-status">الحالة</Label>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, status: value as TrainingCohortStatus }))
                }
              >
                <SelectTrigger id="cohort-status" aria-label="حالة الدُّفعة">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_COHORT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TRAINING_COHORT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="form-help-text">الدُّفعة المفتوحة فقط تظهر في استمارة التَّقديم.</p>
            </div>
          </div>

          <Button type="submit" isLoading={saving} disabled={saving}>
            {editingId ? 'حفظ التَّعديلات' : 'إضافة الدُّفعة'}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الدُّفعات">
          {[0, 1, 2].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-4">
              <Skeleton className="mb-3 h-5 w-40" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : cohorts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="لا توجد دُفعات بعد"
          description="أضِف دُفعة بتاريخ بدء وعدد مقاعد ليتمكَّن الطُّلَّاب من اختيارها عند التَّقديم."
        />
      ) : (
        <ul className="space-y-3">
          {cohorts.map((cohort) => {
            const seatsLeft = trainingCohortSeatsLeft(cohort);
            const isToggling = togglingId === cohort.id;

            return (
              <li
                key={cohort.id}
                className="border-border/60 bg-card hover:border-primary/20 rounded-2xl border p-4 shadow-xs transition-colors sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-foreground text-base font-bold">{cohort.label}</h2>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONES[cohort.status]}`}
                      >
                        {TRAINING_COHORT_STATUS_LABELS[cohort.status]}
                      </span>
                    </div>
                    <dl className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                        <dt className="sr-only">تاريخ البدء</dt>
                        <dd>{formatHijriDate(cohort.starts_at)}</dd>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="size-4 shrink-0" aria-hidden="true" />
                        <dt className="sr-only">المقاعد</dt>
                        <dd>
                          {cohort.seats_taken}/{cohort.capacity} مشغولة · {seatsLeft} متبقٍّ
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isToggling}
                      onClick={() => void toggleStatus(cohort)}
                    >
                      {isToggling && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                      {cohort.status === 'open' ? 'إغلاق' : 'فتح'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`تعديل ${cohort.label}`}
                      onClick={() => startEdit(cohort)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
