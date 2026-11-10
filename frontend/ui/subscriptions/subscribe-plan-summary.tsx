import { Check } from 'lucide-react';

import { SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { formatCount } from '@/frontend/shared/format';

interface SubscribePlanSummaryProps {
  /** The catalogue's price, already formatted for the page. */
  price: string;
  durationDays: number;
  /** What the plan holds in each service, from the same catalogue. */
  itemCap: number;
}

/**
 * What the reader is about to ask for, stated once above the form.
 *
 * The price is the card's one loud element; the term sits under it as quiet
 * metadata, because "$10" and "لمدّة 30 يومًا" answer different questions and
 * reading them at the same size made the second one look like part of the
 * figure. The discount and the connected-apps line are not sold here: this
 * screen asks for a name and a number, and every other allowance is stated
 * where the member meets its limit.
 */
export function SubscribePlanSummary({ price, durationDays, itemCap }: SubscribePlanSummaryProps) {
  return (
    <section
      aria-label="تفاصيل الخطَّة المدفوعة"
      className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
    >
      <p className="text-4xl font-black leading-none tracking-tight">
        <SectionTitleHighlight>{price}</SectionTitleHighlight>
      </p>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        لمدّة {formatCount(durationDays)} يومًا
      </p>

      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>حتَّى {formatCount(itemCap)} عنصر من كل خدمة.</span>
        </li>
      </ul>
    </section>
  );
}
