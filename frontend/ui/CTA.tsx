import { ScrollAnimation } from './ScrollAnimations';
import { ArrowLeft } from 'lucide-react';
import { getWhatsAppUrl } from '@/frontend/shared/constants';

export function CTA() {
  return (
    <section
      id="cta"
      dir="rtl"
      className="relative py-20 sm:py-28 lg:py-36 overflow-hidden bg-slate-950 text-white flex items-center justify-center min-h-125"
    >
      {/* Dynamic Ambient Background Layers */}
      <div
        className="absolute inset-0 pointer-events-none select-none overflow-hidden"
        aria-hidden="true"
      >
        {/* Modern Radial Gradient Atmosphere — the gradient already fades to
            transparent by 70%; no blur filter needed */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1000px,100vw)] h-[min(600px,80vw)] bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.15)_0%,rgba(79,70,229,0.08)_40%,transparent_70%)] transform-gpu" />

        {/* High-end Ambient Glow Spheres */}
        <div className="absolute top-0 right-1/4 w-72 sm:w-96 h-72 sm:h-96 text-purple-600/14 rounded-full glow-orb transform-gpu" />
        <div className="absolute bottom-0 left-1/4 w-72 sm:w-96 h-72 sm:h-96 text-indigo-600/14 rounded-full glow-orb transform-gpu" />

        {/* Subtle Tech Grid Texture Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] bg-size-[24px_24px] opacity-20 mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl z-10">
        <ScrollAnimation animation="slide-up" duration={0.8}>
          <div className="relative max-w-4xl mx-auto">
            {/* Glassmorphic Glow Card Container */}
            <div className="relative rounded-3xl border border-white/10 bg-slate-900/65 px-6 py-12 sm:px-12 sm:py-16 md:py-20 text-center shadow-[0_0_50px_-12px_rgba(147,51,234,0.25)] overflow-hidden group">
              {/* Subtle Card Border Highlight Beam */}
              <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-purple-500/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-slate-800 to-transparent" />

              {/* Status Badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 mb-6 sm:mb-8 rounded-full bg-slate-950/88 border border-purple-500/30 text-slate-200 text-xs sm:text-sm font-medium shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-[background-color,border-color] duration-300 hover:border-purple-500/60 hover:bg-slate-900">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="tracking-wide text-slate-200">متاحون للرَّد 24/7</span>
              </div>

              {/* Headline */}
              <h2 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-balance mb-6 leading-snug">
                <span className="block lg:inline gradient-text">لا تترك</span>{' '}
                <span className="block lg:inline gradient-text">مستقبلك</span>{' '}
                <span className="block lg:inline gradient-text">للصُّدفة</span>
              </h2>

              {/* Subtitle / Description */}
              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-slate-300/90 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed sm:leading-loose text-balance font-normal">
                الفرص لا تنتظر، ابدأ الآن في بناء مسارك المهني أو مشروعك الخاص بدعم من نخبة الخبراء.
              </p>

              {/* Primary Call to Action Button */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href={getWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="تواصل معنا عبر واتساب"
                  className="group/btn relative h-14 w-auto min-w-50 max-w-full inline-flex items-center justify-center gap-3 px-8 rounded-full font-bold text-base sm:text-lg text-white bg-linear-to-r from-purple-600 via-indigo-600 to-purple-600 shadow-[0_0_25px_-5px_rgba(147,51,234,0.5)] hover:shadow-[0_0_35px_0px_rgba(147,51,234,0.7)] transition-transform duration-500 ease-out hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 overflow-hidden cursor-pointer"
                >
                  {/* Subtle Inner Ambient Glow Sheen Effect */}
                  <span className="absolute inset-0 rounded-full bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 ease-in-out" />

                  <span className="relative z-10 flex items-center gap-2.5">
                    تواصل معنا الآن
                    <ArrowLeft
                      className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 ease-out group-hover/btn:-translate-x-1.5"
                      aria-hidden="true"
                    />
                  </span>
                </a>
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}
