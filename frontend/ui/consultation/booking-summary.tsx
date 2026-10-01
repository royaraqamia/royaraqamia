'use client';

import { Building2, Layers, Mic, Wallet } from 'lucide-react';
import type { ConsultationPackage } from '@/shared/contracts/consultation';
import { CollapsibleText } from '@/frontend/ui/shared/collapsible-text';
import { SITE_NAME } from '@/frontend/shared/metadata';

function packageCountLabel(count: number): string {
  if (count === 1) return 'باقة واحدة';
  if (count === 2) return 'باقتان';
  return `${count} باقات`;
}

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

  const items = [
    { icon: Building2, label: 'المقدِّم', value: SITE_NAME },
    { icon: Mic, label: 'نوع الجلسة', value: 'صوتيَّة ومباشرة (1:1)' },
    {
      icon: Layers,
      label: 'الباقات',
      value: packages.length > 0 ? packageCountLabel(packages.length) : 'قريبًا',
    },
  ];

  return (
    <section
      aria-label="تفاصيل الاستشارة"
      className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
    >
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
        <span className="bg-linear-to-r from-purple-600 via-violet-500 to-indigo-600 dark:from-purple-400 dark:via-violet-300 dark:to-indigo-400 bg-clip-text text-transparent">
          استشارة تقنيَّة مباشرة
        </span>
      </h2>
      <CollapsibleText
        lines={2}
        className="mt-2 text-sm text-muted-foreground leading-relaxed"
        buttonClassName="text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
      >
        تحليل كامل لاحتياجاتك الرَّقميَّة: نُراجع ما لديك ونرسم لك مسار التَّنفيذ خطوة بخطوة. جلسة
        صوتيَّة مباشرة بتوقيت مرن يُناسب جدولك، وخطَّة عمل مُخصَّصة تمنحك الوضوح التَّام. اختر
        الباقة والموعد، وأكِّد طلبك دون تسجيل دخول ودون دفع على الموقع.
      </CollapsibleText>

      <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="truncate text-sm font-bold text-foreground">{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      {startingPrice !== null && (
        <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-2 border-t border-border/50 pt-5">
          <span className="text-xs font-medium text-muted-foreground">تبدأ من</span>
          <span className="text-2xl font-black tracking-tight text-foreground">
            {`$${startingPrice}`}
          </span>
          <span className="text-xs text-muted-foreground">حسب الباقة</span>
          <span className="inline-flex items-center gap-1 self-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            دون دفع على الموقع
          </span>
        </div>
      )}
    </section>
  );
}
