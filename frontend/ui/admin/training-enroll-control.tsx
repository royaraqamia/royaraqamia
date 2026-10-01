'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, UserMinus, UserPlus } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import {
  enrollTrainingApplication,
  getTrainingCohorts,
  releaseTrainingApplication,
} from '@/frontend/api/training';
import { trainingCohortSeatsLeft, type TrainingCohort } from '@/shared/contracts/training';

interface EnrollControlProps {
  applicationId: string;
  isEnrolled: boolean;
  enrolledCohortId: string | null;
  onChanged: () => void;
}

/**
 * Enrolling is an explicit act with a chosen Cohort, not a status flip — the seat
 * is scarce and is claimed through the capacity-guarded RPC (ADR-0008). So this
 * only ever offers a Cohort + an "enroll" button, never a free status dropdown.
 */
export function EnrollControl({
  applicationId,
  isEnrolled,
  enrolledCohortId,
  onChanged,
}: EnrollControlProps) {
  const [cohorts, setCohorts] = useState<TrainingCohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTrainingCohorts().then((result) => {
      if (!cancelled) setCohorts(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnroll() {
    if (!selectedCohortId) return;
    setPending(true);
    setError(null);
    const result = await enrollTrainingApplication(applicationId, selectedCohortId);
    setPending(false);
    if (!result.success) {
      setError(result.error ?? 'تعذَّر التَّسجيل في الدُّفعة.');
      return;
    }
    onChanged();
  }

  async function handleRelease() {
    setPending(true);
    setError(null);
    const result = await releaseTrainingApplication(applicationId, { status: 'new' });
    setPending(false);
    if (!result.success) {
      setError(result.error ?? 'تعذَّر إلغاء التَّسجيل.');
      return;
    }
    onChanged();
  }

  if (isEnrolled) {
    const enrolledCohort = cohorts.find((cohort) => cohort.id === enrolledCohortId);
    return (
      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="size-4" aria-hidden="true" />
          {enrolledCohort ? `مُسجَّل في ${enrolledCohort.label}` : 'مُسجَّل'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleRelease()}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserMinus className="size-4" aria-hidden="true" />
          )}
          إلغاء التَّسجيل
        </Button>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Select value={selectedCohortId} onValueChange={setSelectedCohortId}>
          <SelectTrigger size="sm" className="min-w-44" aria-label="اختر الدُّفعة للتَّسجيل">
            <SelectValue placeholder="اختر الدُّفعة" />
          </SelectTrigger>
          <SelectContent>
            {cohorts.length === 0 ? (
              <SelectItem value="__none__" disabled>
                لا توجد دُفعات
              </SelectItem>
            ) : (
              cohorts.map((cohort) => {
                const seatsLeft = trainingCohortSeatsLeft(cohort);
                return (
                  <SelectItem key={cohort.id} value={cohort.id} disabled={seatsLeft === 0}>
                    {cohort.label} — {seatsLeft === 0 ? 'اكتمل العدد' : `${seatsLeft} أماكن`}
                  </SelectItem>
                );
              })
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleEnroll()}
          disabled={pending || !selectedCohortId}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus className="size-4" aria-hidden="true" />
          )}
          تسجيل
        </Button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
