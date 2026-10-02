'use client';

import type { ConsultationPackage } from '@/shared/contracts/consultation';
import { CollapsibleText } from '@/frontend/ui/shared/collapsible-text';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

interface BookingSummaryProps {
  packages: ConsultationPackage[];
}

/**
 * The booking page's pitch, shown above the wizard and hidden once the booking
 * is created. Package-dependent figures come from the same list the wizard
 * renders, so the summary cannot advertise a package that is not offered.
 */
export function BookingSummary({ packages }: BookingSummaryProps) {
  const startingPrice = packages.length > 0 ? Math.min(...packages.map((p) => p.price_usd)) : null;

  return (
    <section
      aria-label="تفاصيل الاستشارة"
      className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
    >
      <SectionTitle size="card">
        <SectionTitleHighlight>حجز استشارة</SectionTitleHighlight>
      </SectionTitle>
      <CollapsibleText
        lines={2}
        className="mt-2 text-sm text-muted-foreground leading-relaxed"
        buttonClassName="text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
      >
        تحليل كامل لاحتياجاتك الرَّقميَّة: نُراجع ما لديك ونرسم لك مسار التَّنفيذ خطوة بخطوة. جلسة
        صوتيَّة مباشرة بتوقيت مرن يُناسب جدولك، وخطَّة عمل مُخصَّصة تمنحك الوضوح التَّام. اختر
        الباقة والموعد، وأكِّد طلبك دون تسجيل دخول ودون دفع على الموقع.
      </CollapsibleText>

      {startingPrice !== null && (
        <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-2 border-t border-border/50 pt-5">
          <span className="text-xs font-medium text-muted-foreground">تبدأ من</span>
          <span className="text-2xl font-black tracking-tight text-foreground">
            {`$${startingPrice}`}
          </span>
          <span className="text-xs text-muted-foreground">حسب الباقة</span>
        </div>
      )}
    </section>
  );
}
