'use client';

import { Package, type LucideIcon } from 'lucide-react';

import { useHorizontalScroll } from '@/frontend/shared/use-horizontal-scroll';
import { HorizontalScrollArrows } from './HorizontalScrollArrows';
import { MotionReveal } from './MotionReveal';
import type { ColorKey } from './services/colorConfigs';
import { ServiceCard, type ServiceCardModel } from './services/ServiceCard';
import { SectionTitle, SectionTitleHighlight } from './shared/section-title';
import type { NavLink } from './navbar/NavDropdown';
import { SERVICES_LINK } from './navbar/services-link';

/**
 * Presentation-only copy for each entry of the `خدماتنا` menu. Titles, icons and
 * routes come from the menu itself, so the homepage row and the sheet never list
 * different services.
 */
const SERVICE_COPY: Record<string, { description: string; colorKey: ColorKey }> = {
  '/request-project': {
    description: 'أخبرنا بمشروعك واحصل على رقم طلب فورًا.',
    colorKey: 'indigo',
  },
  '/hire': {
    description: 'فريق تِقنيّ يتولَّى صيانة مشاريعك وتطويرها شهريًّا.',
    colorKey: 'violet',
  },
  '/news': {
    description: 'مُلخَّص يوميّ لأهم أخبار العالم من مصادر موثوقة.',
    colorKey: 'cyan',
  },
  '/training/apply': {
    description: 'سجِّل في المسار التَّدريبيّ وابنِ مشاريعك دون كتابة كود.',
    colorKey: 'purple',
  },
  '/verify': {
    description: 'تأكَّد من أصالة شهادة صادرة عنَّا برمز التَّحقُّق.',
    colorKey: 'emerald',
  },
  '/consultation/book': {
    description: 'احجز جلستك الاستشاريَّة واختر الموعد المناسب.',
    colorKey: 'blue',
  },
  '/rates': {
    description: 'أسعار صرف العملات والذَّهب والفِضَّة لحظة بلحظة.',
    colorKey: 'amber',
  },
  '/downloader': {
    description: 'حمِّل الصَّوت أو الفيديو من رابط على منصَّات التَّواصل.',
    colorKey: 'pink',
  },
  '/scan': {
    description: 'اقرأ رموز QR والباركود بكاميرا هاتفك دون إرسال صور.',
    colorKey: 'teal',
  },
  '/quran': {
    description: 'اقرأ القرآن الكريم كاملًا برواية حفصٍ عن عاصم.',
    colorKey: 'lime',
  },
  '/athkar': {
    description: 'أذكار الصَّباح والمساء مع المصادر والفضل وعدَّاد يوميّ.',
    colorKey: 'sky',
  },
  '/linksnap': {
    description: 'اختصر روابطك الطَّويلة وتتبَّع أداءها بسهولة.',
    colorKey: 'rose',
  },
  '/habitflow': {
    description: 'تتبَّع عاداتك اليوميَّة والأسبوعيَّة وراقب تقدُّمك.',
    colorKey: 'coral',
  },
  '/spendtrack': {
    description: 'تتبَّع مصاريفك وحلِّل أنماط إنفاقك.',
    colorKey: 'orange',
  },
  '/mcp/guide': {
    description: 'اربط وكلاء البرمجة بأدواتنا عبر بروتوكول MCP.',
    colorKey: 'indigo',
  },
};

function toServiceCard(item: NavLink): ServiceCardModel {
  const copy = SERVICE_COPY[item.href];
  const Icon: LucideIcon = item.icon ?? Package;

  return {
    icon: Icon,
    title: item.label,
    description: copy?.description ?? '',
    colorKey: copy?.colorKey ?? 'indigo',
    href: item.href,
  };
}

const services = (SERVICES_LINK.subItems ?? []).map(toServiceCard);

export function Services() {
  const { scrollContainerRef, canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(360);

  return (
    <section
      id="services"
      dir="rtl"
      aria-labelledby="services-heading"
      className="relative py-24 sm:py-32 lg:py-40 overflow-hidden bg-[#030712] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200"
    >
      {/* Top Ambient Highlight Border */}
      <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-indigo-500/30 to-transparent pointer-events-none" />

      {/* Modern Architectural Dot/Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29371a_1px,transparent_1px),linear-gradient(to_bottom,#1f29371a_1px,transparent_1px)] bg-size-[3.5rem_3.5rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_35%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-12 relative z-10">
        {/* Section Header */}
        <MotionReveal
          from="translateY(-30px)"
          className="text-center max-w-3xl mx-auto mb-8 sm:mb-10 lg:mb-12 flex flex-col items-center"
        >
          <SectionTitle tone="inverse" id="services-heading">
            ماذا <SectionTitleHighlight>نُقدِّم</SectionTitleHighlight>؟
          </SectionTitle>
        </MotionReveal>
      </div>

      {/* Horizontally scrolling row — full-bleed on the viewport, exactly like
          the testimonials track, so cards are not clipped at the 7xl container
          edge. Swipe on touch, arrows on desktop. */}
      <MotionReveal from="none" className="relative z-10">
        <div
          ref={scrollContainerRef}
          className="horizontal-scroll services-scroll-track scrollbar-none pt-4 pb-6"
        >
          <ul role="list" className="flex gap-6 sm:gap-8 w-max">
            {services.map((service) => (
              <li key={service.href} className="w-[18rem] sm:w-[20rem] shrink-0 snap-start flex">
                <ServiceCard service={service} />
              </li>
            ))}
          </ul>
        </div>

        <HorizontalScrollArrows
          onScroll={scroll}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          ariaLabelLeft="الخدمة التَّالية"
          ariaLabelRight="الخدمة السَّابقة"
        />
      </MotionReveal>

      {/* Bottom Ambient Divider Line */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-slate-800 to-transparent pointer-events-none" />
    </section>
  );
}
