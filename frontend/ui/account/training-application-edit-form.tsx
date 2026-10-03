'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/frontend/ui/primitives/button';
import { getOpenTrainingCohorts, updateMyTrainingApplication } from '@/frontend/api/training';
import {
  TRAINING_COURSE,
  TrainingApplicationSchema,
  type TrainingApplication,
  type TrainingCohort,
} from '@/shared/contracts/training';
import { CohortStep } from '../training/steps/cohort-step';
import { DetailsStep } from '../training/steps/details-step';
import type { TrainingApplicationFormValues } from '../training/training-application-wizard';

interface TrainingApplicationEditFormProps {
  application: TrainingApplication;
  onSaved: (application: TrainingApplication) => void;
  onCancel: () => void;
}

function toFormValues(application: TrainingApplication): TrainingApplicationFormValues {
  return {
    course_slug: TRAINING_COURSE.slug,
    full_name: application.full_name,
    phone_whatsapp: application.phone_whatsapp,
    goal: application.goal ?? '',
    cohort_id: application.cohort_id ?? '',
  };
}

/**
 * Reuses the same two steps as the public wizard, so the fields, labels and
 * validation rules cannot drift between "submit" and "edit". While the
 * application is enrolled the cohort is fixed: it holds a claimed seat, and
 * changing it is a release-then-enroll, not an edit (ADR-0008). The service
 * refuses the change; the form simply does not offer it.
 */
export function TrainingApplicationEditForm({
  application,
  onSaved,
  onCancel,
}: TrainingApplicationEditFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<TrainingCohort[]>([]);
  const isEnrolled = application.status === 'enrolled';

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TrainingApplicationFormValues>({
    resolver: zodResolver(TrainingApplicationSchema),
    mode: 'onBlur',
    defaultValues: toFormValues(application),
  });

  useEffect(() => {
    let cancelled = false;
    void getOpenTrainingCohorts().then((result) => {
      if (!cancelled) setCohorts(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const response = await updateMyTrainingApplication(application.id, {
      course_slug: values.course_slug,
      full_name: values.full_name,
      phone_whatsapp: values.phone_whatsapp,
      goal: values.goal,
      cohort_id: values.cohort_id,
    });

    if (response.success && response.data) {
      onSaved(response.data);
      return;
    }

    setSubmitError(response.error ?? 'حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى.');
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
      className="space-y-5"
    >
      {isEnrolled ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          مقعدك محجوز في هذه الدُّفعة. يمكنك تعديل بياناتك، أمَّا تغيير الدُّفعة فيتطلَّب التواصل
          معنا.
        </p>
      ) : (
        <CohortStep control={control} cohorts={cohorts} error={errors.cohort_id?.message} />
      )}

      <DetailsStep control={control} register={register} errors={errors} />

      {submitError && (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {submitError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="hero" isLoading={isSubmitting} disabled={isSubmitting}>
          حفظ التَّعديلات
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
