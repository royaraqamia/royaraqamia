'use client';

import { Globe, MapPin } from 'lucide-react';
import { REGION_LABELS, type ConsultationRegion } from '@/shared/contracts/consultation';
import { Input } from '@/frontend/ui/primitives/input';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { Label } from '@/frontend/ui/primitives/label';
import type { BookingContactDraft } from '@/frontend/state/consultation/use-booking-flow';
import { cn } from '@/frontend/shared/cn';

interface DetailsStepProps {
  contact: BookingContactDraft;
  onChange: (patch: Partial<BookingContactDraft>) => void;
  region: ConsultationRegion;
  onRegionChange: (region: ConsultationRegion) => void;
  fieldErrors: Record<string, string>;
}

const REGION_HINTS: Record<ConsultationRegion, string> = {
  syria: 'الدفع عبر ShamCash',
  global: 'الدفع عبر MoneyGram',
};

export function DetailsStep({
  contact,
  onChange,
  region,
  onRegionChange,
  fieldErrors,
}: DetailsStepProps) {
  const regions: ConsultationRegion[] = ['syria', 'global'];

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
        <Input
          id="booking-phone"
          value={contact.phone_whatsapp}
          onChange={(e) => onChange({ phone_whatsapp: e.target.value })}
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          placeholder="+963 9XX XXX XXX"
          className="bg-muted border-border rounded-xl focus-ring text-left"
        />
        {fieldErrors['phone_whatsapp'] && (
          <p className="text-sm text-destructive mt-1">{fieldErrors['phone_whatsapp']}</p>
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

      <fieldset className="form-field">
        <legend className="form-label mb-2">أين تقيم؟ (يحدد طريقة الدفع)</legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="المنطقة">
          {regions.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={region === value}
              onClick={() => onRegionChange(value)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-2 p-4 text-right transition-all duration-300 cursor-pointer',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
                region === value
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50'
              )}
            >
              {value === 'syria' ? (
                <MapPin className="size-5 text-primary shrink-0" />
              ) : (
                <Globe className="size-5 text-primary shrink-0" />
              )}
              <span>
                <span className="block font-semibold text-foreground">{REGION_LABELS[value]}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {REGION_HINTS[value]}
                </span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
