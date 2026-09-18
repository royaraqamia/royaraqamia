'use client';

import { Input } from '@/frontend/ui/primitives/input';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { Label } from '@/frontend/ui/primitives/label';
import { CountryPhoneInput } from '@/frontend/ui/shared/country-phone-input';
import {
  arabicCharCountNoun,
  TOPIC_DESCRIPTION_MAX,
  TOPIC_DESCRIPTION_MIN,
} from '@/shared/contracts/consultation';
import type { BookingContactDraft } from '@/frontend/state/consultation/use-booking-flow';

interface DetailsStepProps {
  contact: BookingContactDraft;
  onChange: (patch: Partial<BookingContactDraft>) => void;
  onBlurField?: (field: keyof BookingContactDraft) => void;
  fieldErrors: Record<string, string>;
}

export function DetailsStep({ contact, onChange, onBlurField, fieldErrors }: DetailsStepProps) {
  const topicError = fieldErrors['topic_description'];
  const topicDescribedBy = ['booking-topic-hint', topicError ? 'booking-topic-error' : '']
    .filter(Boolean)
    .join(' ');

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
          onBlur={() => onBlurField?.('full_name')}
          error={Boolean(fieldErrors['full_name'])}
          maxLength={120}
          autoComplete="name"
          placeholder="اكتب اسمك كما تُريد أن نُناديك"
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
          onBlur={() => onBlurField?.('phone_whatsapp')}
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
          موضوع الاستشارة — ماذا تُريد أن تُحقِّق؟{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Textarea
          id="booking-topic"
          value={contact.topic_description}
          onChange={(e) => onChange({ topic_description: e.target.value })}
          onBlur={() => onBlurField?.('topic_description')}
          error={Boolean(topicError)}
          rows={4}
          minLength={TOPIC_DESCRIPTION_MIN}
          maxLength={TOPIC_DESCRIPTION_MAX}
          showCount
          aria-describedby={topicDescribedBy}
          placeholder="اشرح هدفك أو المشكلة التي تُريد حلَّها حتَّى نُجهِّز لك أفضل استشارة ممكنة إن شاء الله..."
          className="bg-muted border-border rounded-xl focus-ring"
        />
        <p id="booking-topic-hint" className="form-help-text">
          {TOPIC_DESCRIPTION_MIN} {arabicCharCountNoun(TOPIC_DESCRIPTION_MIN)} على الأقل — كُلَّما
          وضَّحت أكثر، كانت الاستشارة أدق.
        </p>
        {topicError && (
          <p id="booking-topic-error" className="text-sm text-destructive mt-1">
            {topicError}
          </p>
        )}
      </div>
    </div>
  );
}
