'use client';

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';

import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import { FieldError } from '@/frontend/ui/shared/field-error';
import type { SubscribeFormValues } from './subscribe-form';

interface SubscribeContactFieldsProps {
  control: Control<SubscribeFormValues>;
  register: UseFormRegister<SubscribeFormValues>;
  errors: FieldErrors<SubscribeFormValues>;
}

/**
 * The two answers the request needs. The phone is what the Admin uses to
 * arrange activation, so it is required; the page's own copy says that, rather
 * than a field for everything a reader might be willing to share.
 */
export function SubscribeContactFields({ control, register, errors }: SubscribeContactFieldsProps) {
  return (
    <div className="space-y-5">
      <div className="form-field">
        <Label htmlFor="full_name" required>
          الاسم الكامل
        </Label>
        <Input
          id="full_name"
          autoComplete="name"
          placeholder="مثال: مُحمَّد الحسن"
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
          اختر رمز الدَّولة ثمَّ اكتب رقمك — سنتواصل معك على هذا الرَّقم لتفعيل الخطَّة.
        </p>
        <FieldError id="phone_whatsapp-error" message={errors.phone_whatsapp?.message} />
      </div>
    </div>
  );
}
