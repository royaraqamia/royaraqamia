import { Button } from './primitives/button';
import { Code, Rocket, ShieldCheck, Smartphone, Monitor, Globe } from 'lucide-react';
import { WHATSAPP_PHONE } from '@/frontend/shared/constants';
import { SectionBackground } from './SectionBackground';
import { MotionReveal } from './MotionReveal';

// --- Scroll reveal (IO island + CSS animations) ---

export function WebDevService() {
  const benefits = [
    { icon: Code, text: 'أفضل ممارسات البرمجة بكود نظيف وقابل للصِّيانة' },
    { icon: Rocket, text: 'نشر سريع مع أداء مُحسَّن' },
    { icon: ShieldCheck, text: 'تطوير آمن مع معايير أمان حديثة' },
    { icon: Smartphone, text: 'تصميم متجاوب لجميع الأجهزة وأحجام الشَّاشات' },
  ];

  const features = [
    { title: 'Web', description: 'Next.js' },
    { title: 'Mobile', description: 'Flutter' },
    { title: 'Backend', description: 'Supabase' },
  ];

  return (
    <section
      id="web-dev-service"
      aria-labelledby="web-dev-heading"
      className="relative py-16 sm:py-24 lg:py-32 overflow-hidden bg-background"
    >
      {/* Background with optimized z-index and subtle overlay */}
      <div className="absolute inset-0 z-0 opacity-80 pointer-events-none">
        <SectionBackground
          blobs={[
            {
              top: '0',
              left: '0',
              width: '500px',
              height: '500px',
              background: 'rgba(139, 92, 246, 0.08)',
              filter: 'blur(60px)',
              transform: 'translate(-20%, -30%)',
              animation: 'pulse-slow 8s ease-in-out infinite',
            },
            {
              bottom: '0',
              right: '0',
              width: '500px',
              height: '500px',
              background: 'rgba(124, 58, 237, 0.08)',
              filter: 'blur(60px)',
              transform: 'translate(20%, 20%)',
              animation: 'pulse-slow 8s ease-in-out infinite',
              animationDelay: '2s',
            },
          ]}
        />
        {/* Subtle high-end texture overlay */}
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <MotionReveal
          from="translateY(24px)"
          className="text-center max-w-3xl mx-auto mb-14 sm:mb-20"
        >
          <h2
            id="web-dev-heading"
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight"
          >
            <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-400 via-violet-300 to-indigo-300">
              البناء
            </span>
          </h2>
        </MotionReveal>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Benefits & Features (Spans 7 cols) */}
          <MotionReveal from="none" className="lg:col-span-7 space-y-8">
            {/* Benefits List */}
            <div className="flex flex-col gap-3.5">
              {benefits.map((benefit, idx) => (
                <div
                  key={idx}
                  className="landing-reveal-item group relative flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-white/6 dark:bg-white/5 border border-white/10 dark:border-white/10 hover:border-purple-500/40 hover:bg-purple-500/8 transition-all duration-300 ease-out shadow-xs hover:shadow-lg hover:shadow-purple-500/5 hover:-translate-y-0.5"
                  style={{ ['--ld' as string]: `${0.08 + idx * 0.12}s` } as React.CSSProperties}
                >
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-linear-to-br from-purple-600 to-violet-700 flex items-center justify-center shrink-0 shadow-md shadow-purple-600/20 group-hover:scale-105 group-hover:rotate-3 transition-transform duration-300">
                    <benefit.icon
                      className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                      aria-hidden="true"
                      fill="currentColor"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-center min-w-0">
                    <span className="text-sm sm:text-base font-semibold text-foreground/90 group-hover:text-foreground transition-colors text-start leading-snug">
                      {benefit.text}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className="landing-reveal-item relative p-5 rounded-2xl bg-purple-950/14 border border-purple-500/15 hover:border-purple-500/40 transition-all duration-300 group overflow-hidden hover:shadow-md hover:shadow-purple-500/10 hover:-translate-y-0.5 flex flex-col justify-between"
                  style={{ ['--ld' as string]: `${0.56 + idx * 0.12}s` } as React.CSSProperties}
                >
                  {/* Subtle hover glow effect */}
                  <div className="absolute inset-0 bg-linear-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div>
                    <div className="inline-block px-2.5 py-1 rounded-md bg-purple-500/25 text-purple-300 text-xs font-mono font-semibold mb-3 border border-purple-500/20">
                      {feature.title}
                    </div>
                    <p className="relative text-xs sm:text-sm text-foreground/80 leading-relaxed font-medium">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </MotionReveal>

          {/* Right Column: Pricing & CTA (Spans 5 cols) */}
          <MotionReveal from="none" className="lg:col-span-5 space-y-5 lg:sticky lg:top-28">
            {/* Pricing Card 1 */}
            <article
              className="landing-reveal-item group relative p-6 sm:p-7 rounded-3xl bg-background/88 border border-white/10 dark:border-white/10 hover:border-purple-500/40 shadow-xl shadow-black/5 hover:shadow-purple-500/10 transition-all duration-300 overflow-hidden"
              style={{ ['--ld' as string]: '0.08s' } as React.CSSProperties}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/14 rounded-full blur-3xl -z-10 group-hover:bg-purple-600/35 transition-colors duration-500 pointer-events-none" />
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-500/14 border border-purple-500/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shrink-0">
                    <Monitor
                      className="w-6 h-6 sm:w-7 sm:h-7 text-purple-400"
                      fill="currentColor"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="text-start min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-foreground">موقع Web</h3>
                    <p className="text-xs sm:text-sm text-foreground/60 mt-1">بدون Backend</p>
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="text-3xl sm:text-4xl font-extrabold text-purple-400 tracking-tight font-mono">
                    $100
                  </div>
                  <div className="text-[11px] sm:text-xs font-semibold text-foreground/50 uppercase tracking-wider mt-0.5">
                    اشتراك شهري لمدَّة 3-6 أشهر
                  </div>
                </div>
              </div>
            </article>

            {/* Pricing Card 2 */}
            <article
              className="landing-reveal-item group relative p-6 sm:p-7 rounded-3xl bg-background/88 border border-white/10 dark:border-white/10 hover:border-purple-500/40 shadow-xl shadow-black/5 hover:shadow-purple-500/10 transition-all duration-300 overflow-hidden"
              style={{ ['--ld' as string]: '0.2s' } as React.CSSProperties}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/14 rounded-full blur-3xl -z-10 group-hover:bg-purple-600/35 transition-colors duration-500 pointer-events-none" />
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-500/14 border border-purple-500/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shrink-0">
                    <Globe
                      className="w-6 h-6 sm:w-7 sm:h-7 text-purple-400"
                      fill="currentColor"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="text-start min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-foreground">
                      تطبيق Web أو Mobile
                    </h3>
                    <p className="text-xs sm:text-sm text-foreground/60 mt-1">مع Backend</p>
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="text-3xl sm:text-4xl font-extrabold text-purple-400 tracking-tight font-mono">
                    $200
                  </div>
                  <div className="text-[11px] sm:text-xs font-semibold text-foreground/50 uppercase tracking-wider mt-0.5">
                    اشتراك شهري لمدَّة 3-6 أشهر
                  </div>
                </div>
              </div>
            </article>

            {/* CTA Button Link */}
            <div
              className="landing-reveal-item pt-2"
              style={{ ['--ld' as string]: '0.32s' } as React.CSSProperties}
            >
              <a
                href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent('السَّلام عليكم، أنا مهتم بخدمة بناء المواقع والتَّطبيقات.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl"
              >
                <Button className="relative w-full h-14 sm:h-16 text-base sm:text-lg font-bold rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white shadow-[0_0_30px_-5px_rgba(147,51,234,0.4)] hover:shadow-[0_0_45px_-5px_rgba(168,85,247,0.6)] active:scale-[0.99] transition-all duration-300 overflow-hidden cursor-pointer">
                  {/* Button hover shimmer animation */}
                  <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-linear-to-r from-transparent via-white/25 to-transparent w-1/2 -skew-x-12 z-0" />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    ابدأ البناء الآن
                  </span>
                </Button>
              </a>
            </div>
          </MotionReveal>
        </div>
      </div>
    </section>
  );
}
