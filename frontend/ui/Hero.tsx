import { ArrowLeft, Star } from 'lucide-react';
import { MotionReveal } from './MotionReveal';
import { LazySection } from './shared/LazySection';
import { getWhatsAppUrl } from '@/frontend/shared/constants';

export function Hero() {
  // Floating particles data - deterministic positions to avoid hydration mismatch
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    size: ((i * 7 + 3) % 3) + 1,
    x: (i * 13 + 7) % 100,
    y: (i * 17 + 11) % 100,
    duration: ((i * 23 + 5) % 20) + 15,
    delay: (i * 11 + 3) % 5,
  }));

  return (
    <>
      <section
        id="home"
        className="relative min-h-[92vh] flex items-center justify-center overflow-hidden pt-32 md:pt-40 pb-16 lg:pt-20 lg:pb-16 bg-slate-950"
      >
        {/* Background Layer - High-End SaaS Mesh & Ambient Lighting */}
        <div className="absolute inset-0 bg-linear-to-b from-slate-950 via-purple-950/40 to-slate-950 z-0 overflow-hidden pointer-events-none">
          {/* Subtle grid pattern overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370f_1px,transparent_1px),linear-gradient(to_bottom,#1f29370f_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

          {/* Glowing radial ambient lights */}
          <div className="absolute top-1/4 right-1/4 w-[min(600px,90vw)] h-[min(600px,90vw)] bg-purple-600/10 blur-[120px] rounded-full transform translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-1/4 left-1/4 w-[min(600px,90vw)] h-[min(600px,90vw)] bg-indigo-600/10 blur-[120px] rounded-full transform -translate-x-1/3 translate-y-1/3" />

          {/* Floating Particles - Ultra subtle background ambient details */}
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="hero-particle absolute rounded-full bg-white/30 backdrop-blur-xs"
              style={{
                width: particle.size,
                height: particle.size,
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                opacity: 0.15,
                ['--particle-duration' as string]: `${particle.duration}s`,
                ['--particle-delay' as string]: `${particle.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <MotionReveal
            from="none"
            className="grid lg:grid-cols-2 gap-10 sm:gap-12 lg:gap-16 items-center"
          >
            {/* Left/Right side - Primary Copy & CTA (RTL Support) */}
            <div className="text-center lg:text-right space-y-3 order-1">
              {/* Pill Badge */}
              <div
                className="landing-reveal-item flex justify-center lg:justify-start"
                style={{ ['--ld' as string]: '0.15s' } as React.CSSProperties}
              >
                <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/4 hover:bg-white/8 backdrop-blur-xl text-white border border-white/10 hover:border-white/20 transition-all duration-300 shadow-sm group">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                  </span>
                  <span className="text-xs sm:text-sm font-medium tracking-wide text-neutral-200">
                    ابدأ رحلتك الرَّقميَّة
                  </span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="text-[11px] font-semibold text-purple-300/90 tracking-wider">
                    1448 هـ
                  </span>
                </div>
              </div>

              {/* Main Headline */}
              <div
                className="landing-reveal-item space-y-2 -mt-2"
                style={{ ['--ld' as string]: '0.27s' } as React.CSSProperties}
              >
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight font-arabic leading-[1.45] sm:leading-[1.45]">
                  <span className="block bg-linear-to-r from-white via-slate-100 to-purple-200 bg-clip-text text-transparent pb-1.5">
                    شريكك الاستراتيجي
                  </span>
                  <span className="block bg-linear-to-r from-purple-400 via-violet-300 to-indigo-300 bg-clip-text text-transparent whitespace-normal lg:whitespace-nowrap pb-2">
                    للتَّحوُّل الرَّقمي
                  </span>
                </h1>
              </div>

              {/* Description */}
              <p
                className="landing-reveal-item text-sm sm:text-base md:text-lg lg:text-lg text-neutral-300 max-w-3xl mx-auto lg:mx-0 leading-relaxed font-normal -mt-2 pt-1"
                style={{ ['--ld' as string]: '0.39s' } as React.CSSProperties}
              >
                نبني مواقع وتطبيقات برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛
                <br />
                كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع
                والتَّطبيقات.
              </p>

              {/* Social Proof Strip - Trust Signals */}
              <a
                href="#testimonials"
                className="landing-reveal-item inline-flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-2xl transition-transform active:scale-[0.99]"
                aria-label="انتقل إلى آراء العملاء"
                style={{ ['--ld' as string]: '0.51s' } as React.CSSProperties}
              >
                <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white/3 hover:bg-white/8 border border-white/10 hover:border-white/20 backdrop-blur-md transition-all duration-300 shadow-xs">
                  <div className="flex">
                    {['أ', 'ز', 'ك'].map((letter, i) => (
                      <div
                        key={i}
                        className={`w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 via-purple-600 to-violet-700 border-2 border-slate-950 flex items-center justify-center text-[10px] font-bold text-white shadow-xs group-hover:scale-105 transition-transform ${
                          i > 0 ? '-ms-2' : ''
                        }`}
                      >
                        <span className="leading-none">{letter}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-xs sm:text-sm text-neutral-300 font-medium">
                    ثقة <span className="font-bold text-white">25+</span> شخص
                  </span>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/2 border border-white/5 backdrop-blur-xs text-neutral-300 transition-all duration-300 group-hover:bg-white/6 group-hover:border-white/10">
                  <span className="flex gap-0.5 text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={14}
                        className="fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]"
                      />
                    ))}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-neutral-200">
                    <span className="font-bold text-white">4.9</span>/5
                  </span>
                </div>
              </a>

              {/* CTA Buttons */}
              <div
                className="landing-reveal-item flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start pt-3 items-center w-full sm:w-auto"
                style={{ ['--ld' as string]: '0.63s' } as React.CSSProperties}
              >
                <a
                  href={getWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="تواصل معنا عبر واتساب"
                  className="group relative h-13 sm:h-14 w-auto min-w-44 sm:min-w-50 flex items-center justify-center px-6 sm:px-8 rounded-full bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500 text-white text-base sm:text-lg font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)] hover:shadow-[0_15px_35px_-5px_rgba(147,51,234,0.7)] border border-white/20 overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  {/* Sheen effect on hover */}
                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />

                  <span className="relative z-10 flex items-center gap-3">
                    تواصل معنا الآن
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1.5 transition-transform duration-300" />
                  </span>
                </a>

                <a
                  href="#portfolio"
                  className="group relative h-13 sm:h-14 w-auto px-6 sm:px-8 rounded-full border border-white/15 hover:border-white/30 bg-white/4 hover:bg-white/8 text-white text-base sm:text-lg font-bold backdrop-blur-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-xs flex items-center justify-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <span className="relative z-10">نبذة عن أعمالنا</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 group-hover:bg-white transition-colors" />
                </a>
              </div>
            </div>

            {/* Right side - Visual Element */}
            <div
              className="landing-reveal-item relative order-2 w-full flex justify-center lg:justify-end mt-4 lg:mt-0"
              style={{ ['--ld' as string]: '0.75s' } as React.CSSProperties}
            >
              {/* Reserve the dashboard's footprint so the lazy HeroVisual mount
                  doesn't grow the hero and trigger CLS. Ratios match its layout:
                  stacked cards on mobile (tall), side-by-side from sm up (square). */}
              <div className="relative w-full aspect-[2/5] sm:aspect-square">
                <LazySection id="hero-visual" className="w-full h-full" />
              </div>
            </div>
          </MotionReveal>
        </div>
      </section>
    </>
  );
}
