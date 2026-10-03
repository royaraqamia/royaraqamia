'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/frontend/ui/primitives/button';
import { updateMyProjectRequest } from '@/frontend/api/project-requests';
import {
  PROJECT_REQUEST_BUDGET_RANGES,
  PROJECT_REQUEST_TIMELINES,
  ProjectRequestSchema,
  type ProjectRequest,
  type ProjectRequestBudgetRange,
  type ProjectRequestTimeline,
} from '@/shared/contracts/project-requests';
import { ProjectTypeStep } from '../project-requests/steps/project-type-step';
import { ProjectDetailsStep } from '../project-requests/steps/project-details-step';
import { ProjectContactStep } from '../project-requests/steps/project-contact-step';
import type { ProjectRequestFormValues } from '../project-requests/project-request-wizard';

const BUDGET_RANGES = new Set<string>(PROJECT_REQUEST_BUDGET_RANGES);
const TIMELINES = new Set<string>(PROJECT_REQUEST_TIMELINES);

/**
 * Budget and timeline are stored as unconstrained text, so a value that is no
 * longer in the fixed set falls back to "unset" rather than being coerced into
 * a choice the submitter never made. The first save then writes the cleared
 * value, which is the honest outcome.
 */
function toFormValues(request: ProjectRequest): ProjectRequestFormValues {
  return {
    full_name: request.full_name,
    phone_whatsapp: request.phone_whatsapp,
    email: request.email ?? '',
    project_type: request.project_type,
    description: request.description,
    budget_range:
      request.budget_range && BUDGET_RANGES.has(request.budget_range)
        ? (request.budget_range as ProjectRequestBudgetRange)
        : undefined,
    timeline:
      request.timeline && TIMELINES.has(request.timeline)
        ? (request.timeline as ProjectRequestTimeline)
        : undefined,
    existing_url: request.existing_url ?? '',
  };
}

interface ProjectRequestEditFormProps {
  request: ProjectRequest;
  onSaved: (request: ProjectRequest) => void;
  onCancel: () => void;
}

/**
 * Reuses the same three steps as the public wizard, so the fields, labels and
 * validation rules cannot drift between "submit" and "edit".
 */
export function ProjectRequestEditForm({
  request,
  onSaved,
  onCancel,
}: ProjectRequestEditFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectRequestFormValues>({
    resolver: zodResolver(ProjectRequestSchema),
    mode: 'onBlur',
    defaultValues: toFormValues(request),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const response = await updateMyProjectRequest(request.id, {
      full_name: values.full_name,
      phone_whatsapp: values.phone_whatsapp,
      email: values.email,
      project_type: values.project_type,
      description: values.description,
      budget_range: values.budget_range,
      timeline: values.timeline,
      existing_url: values.existing_url,
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
      <ProjectTypeStep control={control} error={errors.project_type?.message} />
      <ProjectDetailsStep control={control} register={register} errors={errors} />
      <ProjectContactStep control={control} register={register} errors={errors} />

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
