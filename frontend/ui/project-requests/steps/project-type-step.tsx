'use client';

import { Controller, type Control } from 'react-hook-form';
import { CheckCircle, Wallet } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { FieldError } from '@/frontend/ui/shared/field-error';
import {
  PROJECT_REQUEST_APP_START_PRICE_USD,
  PROJECT_REQUEST_TYPES,
  PROJECT_REQUEST_TYPE_LABELS,
  PROJECT_REQUEST_WEBSITE_START_PRICE_USD,
  type ProjectRequestType,
} from '@/shared/contracts/project-requests';
import type { ProjectRequestFormValues } from '../project-request-wizard';

const START_PRICES: Record<ProjectRequestType, number> = {
  website: PROJECT_REQUEST_WEBSITE_START_PRICE_USD,
  app: PROJECT_REQUEST_APP_START_PRICE_USD,
};

interface ProjectTypeStepProps {
  control: Control<ProjectRequestFormValues>;
  error?: string;
}

export function ProjectTypeStep({ control, error }: ProjectTypeStepProps) {
  return (
    <div className="space-y-4">
      <Controller
        name="project_type"
        control={control}
        render={({ field }) => (
          <div
            className="grid gap-4 sm:grid-cols-2"
            role="radiogroup"
            aria-label="اختر نوع المشروع"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'project_type-error' : undefined}
          >
            {PROJECT_REQUEST_TYPES.map((type) => {
              const selected = field.value === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => field.onChange(type)}
                  className={cn(
                    'text-right rounded-2xl border-2 p-5 transition-safe duration-300 cursor-pointer',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
                    selected
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                      : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-bold text-lg text-foreground">
                      {PROJECT_REQUEST_TYPE_LABELS[type]}
                    </h3>
                    <span
                      className={cn(
                        'flex items-center justify-center size-6 rounded-full border-2 shrink-0 mt-1',
                        selected ? 'border-primary bg-primary' : 'border-border'
                      )}
                    >
                      {selected && <CheckCircle className="size-4 text-primary-foreground" />}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
                    <Wallet className="size-4" aria-hidden="true" />
                    تبدأ من ${START_PRICES[type]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      />
      <FieldError id="project_type-error" message={error} />
    </div>
  );
}
