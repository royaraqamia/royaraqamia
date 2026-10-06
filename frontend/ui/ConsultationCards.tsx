import { Mic } from 'lucide-react';
import { Button } from './primitives/button';
import { ScrollAnimation } from './ScrollAnimations';
import { SectionTitle, SectionTitleHighlight } from './shared/section-title';
import { CONSULTATION_START_PRICE_USD } from '@/shared/contracts/consultation';

export function ConsultationCards() {
  return (
    <section
      id="consultation"
      dir="rtl"
      className="relative overflow-hidden py-20 sm:py-28 md:py-36 bg-slate-950 text-slate-100 selection:bg-purple-500/45 selection:text-purple-200"
      aria-label="الاستشارة التقنية الشاملة"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center mb-8 sm:mb-10 lg:mb-12">
            {/* Main H2 Title */}
            <SectionTitle tone="inverse">
              <SectionTitleHighlight>الاستشارات</SectionTitleHighlight>
            </SectionTitle>
          </div>
        </ScrollAnimation>

        {/* Main Consultation Card */}
        <ScrollAnimation animation="slide-up" duration={0.8} delay={0.2}>
          <div className="relative">
            {/* Glassmorphic Container Card */}
            <div className="relative rounded-3xl overflow-hidden bg-linear-to-b from-purple-950/40 via-slate-950/80 to-slate-950/95 border border-purple-500/30 transition-[border-color] duration-500 hover:border-purple-400/50">
              {/* Vibrant Accent Top Strip */}
              <div className="h-1 w-full bg-linear-to-r from-transparent via-purple-500 to-transparent opacity-80" />

              {/* Internal Card Canvas */}
              <div className="p-6 sm:p-8 md:p-10 lg:p-12">
                {/* Header Row: Interactive Pill Badge + Starting Price */}
                <div className="mt-2 mb-8 pb-8 border-b border-purple-500/15 flex flex-wrap items-center justify-between gap-3">
                  {/* Microphone Feature Badge */}
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-purple-500/25 border border-purple-400/30 shadow-inner shadow-purple-500/10">
                    <Mic className="w-4 h-4 text-purple-300 shrink-0" />
                    <span className="text-xs sm:text-sm text-purple-200 font-bold tracking-wide">
                      مكالمة صوتيَّة
                    </span>
                  </div>

                  {/* Starting Price Badge */}
                  <div className="inline-flex items-baseline gap-2 rounded-full border border-purple-400/30 bg-purple-500/15 px-4 py-2">
                    <span className="text-xs sm:text-sm text-purple-200/80 font-medium">
                      تبدأ من
                    </span>
                    <span
                      dir="ltr"
                      className="text-xl sm:text-2xl font-black tracking-tight bg-linear-to-r from-purple-200 via-white to-purple-300 bg-clip-text text-transparent"
                    >
                      {`$${CONSULTATION_START_PRICE_USD}`}
                    </span>
                  </div>
                </div>

                {/* Title and Description Content */}
                <div className="mb-8 space-y-3">
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                    توجيه تقني متكامل
                  </h3>
                  <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl font-normal">
                    إن كانت لديك استشارة مُحدَّدَة في مجال المواقع والتَّطبيقات، أو رغبتَ في باقة من
                    الجلسات الاستشاريَّة على مدى فترة من الزَّمن لتقييم مشروعك أو تطويره أو متابعة
                    رحلة تعلُّمك، فنحنُ نُقدِّم لك هذه الخدمة بما منَّ الله به علينا من عِلمٍ وخبرة.
                    وتُقدَّم الاستشارة Online عبر جلسة صوتيَّة مباشرة.
                  </p>
                </div>

                {/* Action CTA Container */}
                <div className="space-y-4">
                  <a
                    href="/consultation/book"
                    className="block group/btn rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    aria-label="احجز استشارتك الآن"
                  >
                    <Button className="w-full h-14 sm:h-16 text-lg sm:text-xl font-bold text-white rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 transition-safe duration-300 ease-out hover:shadow-[0_0_35px_rgba(139,92,246,0.6)] shadow-xl shadow-purple-900/40 cursor-pointer border-0 active:scale-[0.98] flex items-center justify-center gap-3 min-h-11">
                      <span>احجز استشارتك الآن</span>
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}
