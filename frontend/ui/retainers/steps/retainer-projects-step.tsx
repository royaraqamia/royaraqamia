'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { FieldError } from '@/frontend/ui/shared/field-error';
import { RETAINER_CURRENT_PROJECTS_MAX } from '@/shared/contracts/retainers';
import type { RetainerFormValues } from '../retainer-request-wizard';

interface RetainerProjectsStepProps {
  register: UseFormRegister<RetainerFormValues>;
  errors: FieldErrors<RetainerFormValues>;
}

export function RetainerProjectsStep({ register, errors }: RetainerProjectsStepProps) {
  return (
    <div className="space-y-5">
      <div className="form-field">
        <Label htmlFor="company" optional>
          الشَّركة
        </Label>
        <Input
          id="company"
          autoComplete="organization"
          placeholder="مثال: شركة النُّور للتِّجارة"
          {...register('company')}
          error={Boolean(errors.company)}
          aria-describedby={errors.company ? 'company-error' : undefined}
        />
        <FieldError id="company-error" message={errors.company?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="current_projects" required>
          المشاريع التي لديك
        </Label>
        <Textarea
          id="current_projects"
          rows={5}
          maxLength={RETAINER_CURRENT_PROJECTS_MAX}
          showCount
          placeholder="اذكر مشاريعك القائمة: نوعها، تقنيتها إن عرفتها، وحالتها الحاليَّة."
          {...register('current_projects')}
          error={Boolean(errors.current_projects)}
          aria-describedby={errors.current_projects ? 'current_projects-error' : undefined}
        />
        <FieldError id="current_projects-error" message={errors.current_projects?.message} />
      </div>
    </div>
  );
}
