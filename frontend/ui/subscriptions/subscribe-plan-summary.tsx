import { Check } from 'lucide-react';

import { CollapsibleText } from '@/frontend/ui/shared/collapsible-text';
import { SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { formatCount } from '@/frontend/shared/format';
import { SubscribePageHeading } from './subscribe-page-heading';

interface SubscribePlanSummaryProps {
  /** The catalogue's price, already formatted for the page. */
  price: string;
  /** What the plan holds in each service, from the same catalogue. */
  itemCap: number;
}

/**
 * What the reader is about to ask for, stated once above the form.
 *
 * Shaped like the other form pages' summary cards — the page heading lives in
 * the card, a short pitch follows it, and the fee closes the card behind a
 * divider — because this screen is one of a family and used to be the odd one
 * out: a bare price floating in a card with no heading of its own.
 *
 * The discount and the connected-apps line are not sold here: this screen asks
 * for a name and a number, and every other allowance is stated where the member
 * meets its limit.
 */
export function SubscribePlanSummary({ price, itemCap }: SubscribePlanSummaryProps) {
  return (
    <section
      aria-label="تفاصيل الخطَّة المدفوعة"
      className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
    >
      <SubscribePageHeading />
      <CollapsibleText
        lines={2}
        className="mt-2 text-sm text-muted-foreground leading-relaxed"
        buttonClassName="text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
      >
        خطَّة واحدة ترفع سقف ما تُضيفه في كل خدمة، وتُفعَّل على حسابك بعد أن نتواصل معك لتأكيد
        الطَّلب. أرسِل اسمك ورقمك ونُكمل الباقي.
      </CollapsibleText>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-2 border-t border-border/50 pt-5">
        <span className="text-xs font-medium text-muted-foreground">رسوم الاستثمار</span>
        <p className="text-2xl font-black tracking-tight">
          <SectionTitleHighlight>{price}</SectionTitleHighlight>
        </p>
        <span className="text-xs text-muted-foreground">شهريًّا</span>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>حتَّى {formatCount(itemCap)} عنصر من كل خدمة.</span>
        </li>
      </ul>
    </section>
  );
}
