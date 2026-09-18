'use client';

import { Input } from '@/frontend/ui/primitives/input';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { Label } from '@/frontend/ui/primitives/label';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import type { BookingContactDraft } from '@/frontend/state/consultation/use-booking-flow';

interface DetailsStepProps {
  contact: BookingContactDraft;
  onChange: (patch: Partial<BookingContactDraft>) => void;
  fieldErrors: Record<string, string>;
}

export function DetailsStep({ contact, onChange, fieldErrors }: DetailsStepProps) {
  return (
    <div className="space-y-5">
      <div className="form-field">
        <Label htmlFor="booking-name" className="form-label">
          الاسم الكامل{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="booking-name"
          value={contact.full_name}
          onChange={(e) => onChange({ full_name: e.target.value })}
          maxLength={120}
          autoComplete="name"
          placeholder="اكتب اسمك كما تريد أن نناديك"
          className="bg-muted border-border rounded-xl focus-ring"
        />
        {fieldErrors['full_name'] && (
          <p className="text-sm text-destructive mt-1">{fieldErrors['full_name']}</p>
        )}
      </div>

      <div className="form-field">
        <Label htmlFor="booking-phone" className="form-label">
          رقم واتساب{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <CountryPhoneInput
          id="booking-phone"
          value={contact.phone_whatsapp}
          onChange={(phone_whatsapp) => onChange({ phone_whatsapp })}
          placeholder="9XX XXX XXX"
          invalid={Boolean(fieldErrors['phone_whatsapp'])}
          aria-describedby={fieldErrors['phone_whatsapp'] ? 'booking-phone-error' : undefined}
        />
        {fieldErrors['phone_whatsapp'] && (
          <p id="booking-phone-error" className="text-sm text-destructive mt-1">
            {fieldErrors['phone_whatsapp']}
          </p>
        )}
      </div>

      <div className="form-field">
        <Label htmlFor="booking-topic" className="form-label">
          موضوع الاستشارة — ماذا تريد أن تحقق؟{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Textarea
          id="booking-topic"
          value={contact.topic_description}
          onChange={(e) => onChange({ topic_description: e.target.value })}
          rows={4}
          maxLength={2000}
          showCount
          placeholder="اشرح هدفك أو المشكلة التي تريد حلها حتى نجهّز لك أفضل استشارة ممكنة..."
          className="bg-muted border-border rounded-xl focus-ring"
        />
        {fieldErrors['topic_description'] && (
          <p className="text-sm text-destructive mt-1">{fieldErrors['topic_description']}</p>
        )}
      </div>
    </div>
  );
}
