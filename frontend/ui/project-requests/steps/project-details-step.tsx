'use client';

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';

import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { FieldError } from '@/frontend/ui/shared/field-error';
import {
  PROJECT_REQUEST_BUDGET_RANGES,
  PROJECT_REQUEST_BUDGET_RANGE_LABELS,
  PROJECT_REQUEST_DESCRIPTION_MAX,
  PROJECT_REQUEST_TIMELINES,
  PROJECT_REQUEST_TIMELINE_LABELS,
} from '@/shared/contracts/project-requests';
import type { ProjectRequestFormValues } from '../project-request-wizard';

/**
 * Radix Select refuses an empty-string item value, so an optional choice needs
 * a sentinel. It lives here rather than in the contract: the form translates it
 * back to `undefined`, so it never reaches the schema or the wire.
 */
const UNSET = '__unset__';

function SelectField({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder,
  options,
}: {
  id: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  invalid: boolean;
  describedBy?: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select
      value={value ?? UNSET}
      onValueChange={(next) => onChange(next === UNSET ? undefined : next)}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={invalid ? 'border-destructive/60' : undefined}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ProjectDetailsStepProps {
  control: Control<ProjectRequestFormValues>;
  register: UseFormRegister<ProjectRequestFormValues>;
  errors: FieldErrors<ProjectRequestFormValues>;
}

export function ProjectDetailsStep({ control, register, errors }: ProjectDetailsStepProps) {
  return (
    <div className="space-y-5">
      <div className="form-field">
        <Label htmlFor="description" required>
          وصف المشروع
        </Label>
        <Textarea
          id="description"
          rows={6}
          maxLength={PROJECT_REQUEST_DESCRIPTION_MAX}
          showCount
          placeholder="اشرح ما تريد بناءه: الهدف من المشروع، الفئة المستهدفة، وأهم الميزات التي تحتاجها."
          {...register('description')}
          error={Boolean(errors.description)}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        <FieldError id="description-error" message={errors.description?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="budget_range" optional>
          الميزانية المتوقَّعة
        </Label>
        <Controller
          name="budget_range"
          control={control}
          render={({ field }) => (
            <SelectField
              id="budget_range"
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(errors.budget_range)}
              describedBy={errors.budget_range ? 'budget_range-error' : undefined}
              placeholder="غير محدَّد"
              options={PROJECT_REQUEST_BUDGET_RANGES.map((range) => ({
                value: range,
                label: PROJECT_REQUEST_BUDGET_RANGE_LABELS[range],
              }))}
            />
          )}
        />
        <FieldError id="budget_range-error" message={errors.budget_range?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="timeline" optional>
          المدَّة المتوقَّعة
        </Label>
        <Controller
          name="timeline"
          control={control}
          render={({ field }) => (
            <SelectField
              id="timeline"
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(errors.timeline)}
              describedBy={errors.timeline ? 'timeline-error' : undefined}
              placeholder="غير محدَّد"
              options={PROJECT_REQUEST_TIMELINES.map((timeline) => ({
                value: timeline,
                label: PROJECT_REQUEST_TIMELINE_LABELS[timeline],
              }))}
            />
          )}
        />
        <FieldError id="timeline-error" message={errors.timeline?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="existing_url" optional>
          رابط مشروع قائم
        </Label>
        <Input
          id="existing_url"
          dir="ltr"
          inputMode="url"
          placeholder="https://example.com"
          {...register('existing_url')}
          error={Boolean(errors.existing_url)}
          aria-describedby={errors.existing_url ? 'existing_url-error' : undefined}
        />
        <FieldError id="existing_url-error" message={errors.existing_url?.message} />
      </div>
    </div>
  );
}
