'use client';

import { Controller, type Control } from 'react-hook-form';
import { CalendarDays, CheckCircle, Users } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { formatHijriDate } from '@/frontend/shared/format';
import { FieldError } from '@/frontend/ui/shared/field-error';
import { trainingCohortSeatsLeft, type TrainingCohort } from '@/shared/contracts/training';
import type { TrainingApplicationFormValues } from '../training-application-wizard';

interface CohortStepProps {
  control: Control<TrainingApplicationFormValues>;
  cohorts: TrainingCohort[];
  error?: string;
}

export function CohortStep({ control, cohorts, error }: CohortStepProps) {
  if (cohorts.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-6 text-center">
        <p className="text-sm font-bold text-foreground">
          لا توجد دُفعات مفتوحة للتَّسجيل حاليًّا.
        </p>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          لا يمكنك إرسال الطَّلب دون اختيار دُفعة. تابعنا عبر واتساب وسنُعلمك عند فتح الدُّفعة
          القادمة.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        اختر الدُّفعة التي تناسبك. المقاعد محدودة، ويُثبَّت مقعدك عند تأكيد تسجيلك معنا.
      </p>

      <Controller
        name="cohort_id"
        control={control}
        render={({ field }) => (
          <div
            className="grid gap-4"
            role="radiogroup"
            aria-label="اختر الدُّفعة"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'cohort_id-error' : undefined}
          >
            {cohorts.map((cohort) => {
              const selected = field.value === cohort.id;
              const seatsLeft = trainingCohortSeatsLeft(cohort);
              const isFull = seatsLeft === 0;

              return (
                <button
                  key={cohort.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isFull}
                  onClick={() => field.onChange(cohort.id)}
                  className={cn(
                    'text-right rounded-2xl border-2 p-5 transition-safe duration-300 cursor-pointer',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
                    selected
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                      : 'border-border bg-card hover:border-primary/50 hover:shadow-md',
                    isFull && 'opacity-60 cursor-not-allowed hover:border-border hover:shadow-none'
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-bold text-lg text-foreground">{cohort.label}</h3>
                    <span
                      className={cn(
                        'flex items-center justify-center size-6 rounded-full border-2 shrink-0 mt-1',
                        selected ? 'border-primary bg-primary' : 'border-border'
                      )}
                    >
                      {selected && <CheckCircle className="size-4 text-primary-foreground" />}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-bold text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      تبدأ {formatHijriDate(cohort.starts_at)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5',
                        isFull ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      <Users className="size-4" aria-hidden="true" />
                      {isFull ? 'اكتمل العدد' : `${seatsLeft} أماكن متبقية`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      />
      <FieldError id="cohort_id-error" message={error} />
    </div>
  );
}
