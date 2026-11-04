'use client';

import { Check } from 'lucide-react';

/**
 * Step one: what the reader is asking for.
 *
 * It states the plan and the terms the request is for, so the submit is made
 * against a described product rather than a button. Every number comes from the
 * catalogue on the page (`/pricing` reads the same rows), so the two screens
 * cannot promise different things.
 */
export function SubscribePlanStep() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-muted-foreground">
        سجِّل طلبك هنا، ويُفعَّل اشتراكك بعد أن نتواصل معك للتَّأكُّد من بياناتك.
      </p>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {['تفعيل فوري بعد التَّواصل', 'حسب مدة الخطَّة المذكورة أعلاه', 'إلغاء متى شئت'].map(
          (line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{line}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
