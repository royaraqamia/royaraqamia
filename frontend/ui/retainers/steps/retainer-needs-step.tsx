'use client';

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';

import { DatePicker } from '@/frontend/ui/primitives/date-picker';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { FieldError } from '@/frontend/ui/shared/field-error';
import { RETAINER_NEEDS_MAX, todayIsoDate } from '@/shared/contracts/retainers';
import type { RetainerFormValues } from '../retainer-request-wizard';

interface RetainerNeedsStepProps {
  control: Control<RetainerFormValues>;
  register: UseFormRegister<RetainerFormValues>;
  errors: FieldErrors<RetainerFormValues>;
}

export function RetainerNeedsStep({ control, register, errors }: RetainerNeedsStepProps) {
  return (
    <div className="space-y-5">
      <div className="form-field">
        <Label htmlFor="needs" required>
          ما تحتاج صيانته أو تطويره
        </Label>
        <Textarea
          id="needs"
          rows={5}
          maxLength={RETAINER_NEEDS_MAX}
          showCount
          placeholder="حدِّد ما تريد أن نتولَّاه شهريًّا: صيانة، إصلاح أعطال، إضافة ميِّزات، متابعة وإدارة."
          {...register('needs')}
          error={Boolean(errors.needs)}
          aria-describedby={errors.needs ? 'needs-error' : undefined}
        />
        <FieldError id="needs-error" message={errors.needs?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="preferred_start" optional>
          تاريخ البدء المفضَّل
        </Label>
        <Controller
          name="preferred_start"
          control={control}
          render={({ field }) => (
            <DatePicker
              id="preferred_start"
              value={field.value ?? ''}
              onChange={field.onChange}
              placeholder="اختر التَّاريخ"
              min={todayIsoDate()}
              aria-invalid={Boolean(errors.preferred_start)}
              aria-describedby={errors.preferred_start ? 'preferred_start-error' : undefined}
            />
          )}
        />
        <FieldError id="preferred_start-error" message={errors.preferred_start?.message} />
      </div>
    </div>
  );
}
