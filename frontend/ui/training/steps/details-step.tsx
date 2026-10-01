'use client';

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import { FieldError } from '@/frontend/ui/shared/field-error';
import type { TrainingApplicationFormValues } from '../training-application-wizard';

interface DetailsStepProps {
  control: Control<TrainingApplicationFormValues>;
  register: UseFormRegister<TrainingApplicationFormValues>;
  errors: FieldErrors<TrainingApplicationFormValues>;
}

export function DetailsStep({ control, register, errors }: DetailsStepProps) {
  return (
    <div className="space-y-5">
      <div className="form-field">
        <Label htmlFor="full_name" required>
          الاسم الكامل
        </Label>
        <Input
          id="full_name"
          autoComplete="name"
          placeholder="مثال: أحمد العلي"
          {...register('full_name')}
          error={Boolean(errors.full_name)}
          aria-describedby={errors.full_name ? 'full_name-error' : undefined}
        />
        <FieldError id="full_name-error" message={errors.full_name?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="phone_whatsapp" required>
          رقم واتساب
        </Label>
        <Controller
          name="phone_whatsapp"
          control={control}
          render={({ field }) => (
            <CountryPhoneInput
              id="phone_whatsapp"
              value={field.value ?? ''}
              onChange={field.onChange}
              placeholder="9XX XXX XXX"
              invalid={Boolean(errors.phone_whatsapp)}
              aria-describedby={errors.phone_whatsapp ? 'phone_whatsapp-error' : undefined}
            />
          )}
        />
        <p className="form-help-text">
          اختر رمز الدولة ثم اكتب رقمك — سنتواصل معك على هذا الرَّقم.
        </p>
        <FieldError id="phone_whatsapp-error" message={errors.phone_whatsapp?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="goal" optional>
          ماذا تريد أن تبني؟
        </Label>
        <Textarea
          id="goal"
          rows={4}
          maxLength={1000}
          showCount
          placeholder="مثال: أريد إطلاق متجر إلكتروني صغير، أو تحويل فكرة تطبيق إلى منتج أوَّل."
          {...register('goal')}
          error={Boolean(errors.goal)}
          aria-describedby={errors.goal ? 'goal-error' : undefined}
        />
        <FieldError id="goal-error" message={errors.goal?.message} />
      </div>
    </div>
  );
}
