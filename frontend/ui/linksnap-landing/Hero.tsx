import { Link } from 'lucide-react';
import { GlowOrb } from '@/frontend/ui/landing-shared/GlowOrb';
import { HeroSection } from '@/frontend/ui/landing-shared/HeroSection';
import { LandingCta } from '@/frontend/ui/landing-shared/LandingCta';

const floatingIcons = [
  { Icon: Link, delay: 0, x: '-12%', y: '-8%', size: 28 },
  { Icon: Link, delay: 0.5, x: '88%', y: '-12%', size: 24 },
  { Icon: Link, delay: 1, x: '-8%', y: '78%', size: 22 },
  { Icon: Link, delay: 1.5, x: '85%', y: '72%', size: 30 },
];

export function Hero() {
  return (
    <HeroSection
      sectionClassName="relative min-h-dvh flex items-center justify-center overflow-hidden bg-background text-foreground pt-24 md:pt-32 pb-12 lg:py-0"
      decor={
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.25),rgba(255,255,255,0))] pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

          {/* Static glows: pulsing a ~400px layer would recomposite the whole
              texture every frame for an effect invisible at 40% opacity. */}
          <GlowOrb className="w-md h-112 bg-linear-to-br from-primary/30 to-indigo-500/20 top-1/4 -left-32 sm:-left-48 opacity-40 select-none" />
          <GlowOrb className="w-[24rem] h-96 bg-linear-to-tl from-purple-500/20 to-primary/20 bottom-1/4 -right-32 sm:-right-40 opacity-40 select-none" />
        </>
      }
      containerClassName="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      gridClassName="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center"
    >
      {/* Main Hero Copy Container */}
      <div className="landing-enter-up lg:col-span-6 xl:col-span-7 text-center lg:text-right flex flex-col items-center lg:items-start">
        {/* Typography Stack */}
        <h1
          className="landing-enter-up text-4xl xs:text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-arabic leading-tight mb-6"
          style={{ ['--ld' as string]: '0.3s' } as React.CSSProperties}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="bg-linear-to-r from-primary via-indigo-500 to-purple-600 bg-clip-text text-transparent inline-block pb-1">
              اختصِر.
            </span>
            <span className="text-foreground inline-block">شارك.</span>
            <span className="bg-linear-to-r from-purple-600 via-indigo-500 to-primary bg-clip-text text-transparent inline-block pb-1">
              تتبَّع.
            </span>
          </div>
        </h1>

        <h2
          className="landing-enter-up-sm text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mb-8 sm:mb-10 font-normal"
          style={{ ['--ld' as string]: '0.5s' } as React.CSSProperties}
        >
          حوِّل روابطك الطَّويلة إلى روابط قصيرة قويَّة قابلة للتَّتبُّع. راقب كل نقرة واحصل على رؤى
          تفصيليَّة حول جمهورك وأدائك.
        </h2>

        {/* Action Buttons */}
        <div
          className="landing-enter-up-sm flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
          style={{ ['--ld' as string]: '0.7s' } as React.CSSProperties}
        >
          <LandingCta
            appPath="/linksnap/app"
            loginRedirect="/linksnap/app"
            scrollTarget="features"
            primaryClassName="group relative w-full sm:w-auto min-w-45 h-13 px-8 text-base font-semibold rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            loggedOutLabel="ابدأ مجَّانًا"
            loggedInLabel="لوحة التَّحكُّم"
            arrowClassName="transition-transform duration-300 group-hover:-translate-x-1.5"
            secondaryClassName="w-full sm:w-auto min-w-40 h-13 px-8 text-base font-medium rounded-full border-border/80 hover:bg-accent/65 hover:border-border hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            secondaryLabel="اعرف المزيد"
          />
        </div>
      </div>

      {/* Dynamic 3D Interactive Card Showcase */}
      <div
        className="landing-enter-scale lg:col-span-6 xl:col-span-5 relative"
        style={{ ['--ld' as string]: '0.4s' } as React.CSSProperties}
      >
        <div className="relative" style={{ perspective: '1200px' }}>
          {/* Background Glow Ring */}
          <div className="absolute -inset-1.5 bg-linear-to-r from-primary/30 to-purple-600/30 rounded-3xl blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000 pointer-events-none" />

          {/* Main Glass Card */}
          <div
            className="landing-float relative bg-card/88 dark:bg-neutral-900/88 border border-border/80 rounded-2xl p-6 xl:p-8 shadow-2xl shadow-primary/10 transform-gpu transition-all duration-500 hover:border-primary/30"
            style={
              {
                transform: 'rotateY(-6deg) rotateX(4deg)',
                transformStyle: 'preserve-3d',
                ['--landing-float-dur' as string]: '7s',
                ['--landing-float-y' as string]: '-12px',
              } as React.CSSProperties
            }
          >
            {/* Mock Window Topbar */}
            <div className="flex items-center justify-between pb-6 mb-6 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/88 hover:opacity-100 transition-opacity" />
                <div className="w-3 h-3 rounded-full bg-amber-500/88 hover:opacity-100 transition-opacity" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/88 hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-muted/75 text-xs font-mono text-muted-foreground border border-border/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>royaraqamia.com</span>
              </div>
            </div>

            {/* Shortened Links Interactive Mock List */}
            <div className="space-y-3.5">
              {[
                {
                  url: 'https://example.com/very-long-link/123',
                  short: 'royaraqamia.com/abc',
                  clicks: '1.2k',
                  growth: '+24%',
                },
                {
                  url: 'https://blog.example.com/article',
                  short: 'royaraqamia.com/xyz',
                  clicks: '856',
                  growth: '+12%',
                },
                {
                  url: 'https://store.example.com/product',
                  short: 'royaraqamia.com/def',
                  clicks: '2.4k',
                  growth: '+38%',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="landing-enter-left group/item relative bg-muted/55 hover:bg-muted/88 border border-border/40 hover:border-primary/30 rounded-xl p-3.5 transition-all duration-300 shadow-sm"
                  style={{ ['--ld' as string]: `${0.8 + i * 0.15}s` } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-45">
                      {item.url}
                    </span>
                    <span className="inline-flex items-center text-[10px] font-semibold text-emerald-500 bg-emerald-500/14 px-1.5 py-0.5 rounded">
                      {item.growth}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold font-mono text-primary group-hover/item:underline underline-offset-4">
                      {item.short}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">
                      {item.clicks} نقرة
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Mock Card Analytics Footer */}
            <div
              className="landing-enter-fade mt-6 pt-5 border-t border-border/60 flex items-center justify-between"
              style={{ ['--ld' as string]: '1.4s' } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/25 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                  <Link size={18} />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">إحصائيَّات النَّشاط</span>
                  <span className="text-sm font-medium">إجمالي الرَّوابط</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black bg-linear-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
                  12
                </span>
              </div>
            </div>
          </div>

          {/* Depth-of-Field Floating Orbiting Icons */}
          {floatingIcons.map(({ Icon, delay, x, y, size }, i) => (
            <div
              key={i}
              className="landing-float absolute -z-10 pointer-events-none"
              style={
                {
                  left: x,
                  top: y,
                  ['--landing-float-dur' as string]: `${4 + i}s`,
                  ['--landing-float-y' as string]: `${-12 + i * 4}px`,
                  ['--ld' as string]: `${delay}s`,
                } as React.CSSProperties
              }
            >
              <div className=" bg-card/82 border border-border/60 rounded-2xl p-3.5 shadow-xl shadow-black/5">
                <Icon size={size} className="text-primary/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </HeroSection>
  );
}
