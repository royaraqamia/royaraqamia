'use client';

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';

import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import { FieldError } from '@/frontend/ui/shared/field-error';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { SUBSCRIPTION_NOTE_MAX } from '@/shared/contracts/subscriptions';
import type { SubscribeFormValues } from '../subscribe-wizard';

interface SubscribeContactStepProps {
  control: Control<SubscribeFormValues>;
  register: UseFormRegister<SubscribeFormValues>;
  errors: FieldErrors<SubscribeFormValues>;
}

/**
 * Step two: how to reach the reader. The phone is what the Admin uses to arrange
 * activation, so it is required; the email and the note are not.
 */
export function SubscribeContactStep({ control, register, errors }: SubscribeContactStepProps) {
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

      <div className="form-field">
        <Label htmlFor="email" optional>
          البريد الإلكتروني
        </Label>
        <Input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          placeholder="name@example.com"
          {...register('email')}
          error={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <div className="form-field">
        <Label htmlFor="note" optional>
          ما الذي ستعمل عليه؟
        </Label>
        <Textarea
          id="note"
          rows={3}
          maxLength={SUBSCRIPTION_NOTE_MAX}
          placeholder="سطر أو سطران يساعداننا على فهم استخدامك."
          {...register('note')}
          aria-describedby={errors.note ? 'note-error' : undefined}
        />
        <FieldError id="note-error" message={errors.note?.message} />
      </div>
    </div>
  );
}
