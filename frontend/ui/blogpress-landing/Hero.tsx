import { FileText, Sparkle, CheckCircle, Code, Eye } from 'lucide-react';
import { GlowOrb } from '@/frontend/ui/landing-shared/GlowOrb';
import { HeroSection } from '@/frontend/ui/landing-shared/HeroSection';
import { LandingCta } from '@/frontend/ui/landing-shared/LandingCta';

export function Hero() {
  return (
    <HeroSection
      sectionAriaLabel="Hero"
      sectionClassName="relative min-h-dvh w-full flex items-center justify-center overflow-hidden bg-background text-foreground pt-24 md:pt-32 pb-12 lg:py-0"
      decor={
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

          <GlowOrb className="w-125 h-125 bg-primary/35 top-1/4 -right-48 animate-pulse-slow glow-blur-lg" />
          <GlowOrb
            className="w-112.5 h-112.5 bg-indigo-500/25 bottom-1/4 -left-40 animate-pulse-slow glow-blur-lg"
            style={{ animationDelay: '2s' }}
          />
        </>
      }
      containerClassName="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full"
      gridClassName="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center"
    >
      {/* Main Content Column */}
      <div className="landing-enter-up lg:col-span-6 xl:col-span-6 text-center lg:text-right flex flex-col items-center lg:items-start">
        {/* Live Pill Badge */}
        <div
          className="landing-enter-up-sm group inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/14 hover:bg-primary/25 border border-primary/20 hover:border-primary/30 text-primary text-xs sm:text-sm font-medium mb-8 transition-all duration-300 cursor-default shadow-xs"
          style={{ ['--ld' as string]: '0.15s' } as React.CSSProperties}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="tracking-wide">منصَّة التَّدوين</span>
        </div>

        {/* High-Impact Typography Headline */}
        <h1
          className="landing-enter-up text-4xl xs:text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-arabic leading-tight mb-6 text-foreground"
          style={{ ['--ld' as string]: '0.25s' } as React.CSSProperties}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="bg-linear-to-l from-primary via-primary/90 to-foreground bg-clip-text text-transparent inline-block">
              اكتب.
            </span>
            <span className="inline-block hover:opacity-90 transition-opacity">انشر.</span>
            <span className="bg-linear-to-l from-indigo-500 via-primary to-primary/80 bg-clip-text text-transparent inline-block">
              تمّ.
            </span>
          </div>
        </h1>

        {/* Supporting Subtitle */}
        <h2
          className="landing-enter-up-sm text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mb-10 font-normal"
          style={{ ['--ld' as string]: '0.4s' } as React.CSSProperties}
        >
          محرِّر Markdown متكامل مع إدارة المسودَّات وتحسين محرِّكات البحث ونشر احترافي — كل ما
          تحتاجه في مكان واحد.
        </h2>

        {/* Tactile Action Buttons */}
        <div
          className="landing-enter-up-sm flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
          style={{ ['--ld' as string]: '0.55s' } as React.CSSProperties}
        >
          <LandingCta
            appPath="/blogpress/app"
            loginRedirect="/blogpress/app"
            scrollTarget="features"
            primaryClassName="group relative w-full sm:w-auto text-base font-semibold px-8 py-6 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            loggedOutLabel="ابدأ الكتابة مجَّانًا"
            loggedInLabel="لوحة التَّحكُّم"
            arrowClassName="transition-transform duration-300 ease-out group-hover:-translate-x-1.5"
            secondaryClassName="w-full sm:w-auto text-base font-medium px-8 py-6 rounded-full border-border/80 bg-background/65 hover:bg-accent/88 hover:border-border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            secondaryLabel="اعرف المزيد"
          />
        </div>
      </div>

      {/* Interactive Dynamic Editor Preview Mockup */}
      <div
        className="landing-enter-scale lg:col-span-6 xl:col-span-6 relative"
        style={{ ['--ld' as string]: '0.35s' } as React.CSSProperties}
      >
        <div className="relative perspective-3d">
          {/* Diffused Outer Aura */}
          <div className="absolute -inset-1 rounded-3xl bg-linear-to-r from-primary/30 via-indigo-500/20 to-primary/30 blur-2xl opacity-50 hover:opacity-100 transition duration-1000" />

          <div
            className="landing-float relative rounded-2xl border border-white/20 dark:border-white/10 bg-background/88 dark:bg-neutral-900/88 p-6 shadow-2xl shadow-primary/10 transform-gpu"
            style={
              {
                transform: 'rotateY(-6deg) rotateX(3deg)',
                ['--landing-float-dur' as string]: '7s',
                ['--landing-float-y' as string]: '-12px',
              } as React.CSSProperties
            }
          >
            {/* Window Control Bar */}
            <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/90 shadow-xs" />
                <div className="w-3 h-3 rounded-full bg-amber-500/90 shadow-xs" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/90 shadow-xs" />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-muted/75 border border-border/30 text-[11px] font-mono text-muted-foreground dir-ltr">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                royaraqamia.com
              </div>
              <div className="w-12" />
            </div>

            {/* Editor & Live Render Split Columns */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Code Editor Pane */}
              <div className="space-y-3">
                <div className="rounded-xl border border-border/50 bg-card/75 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3 border-b border-border/30 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Code size={14} className="text-primary" />
                      <span className="text-xs font-semibold font-mono text-foreground">
                        editor.md
                      </span>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/14 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      مسودَّة
                    </span>
                  </div>

                  {/* Syntactical Code Placeholder Lines */}
                  <div className="space-y-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="text-primary font-bold">#</span>
                      <div className="h-2.5 bg-foreground/88 rounded w-2/3" />
                    </div>
                    <div className="h-2 bg-muted-foreground/45 rounded w-full" />
                    <div className="h-2 bg-muted-foreground/45 rounded w-5/6" />
                    <div className="flex items-center gap-1">
                      <span className="text-indigo-400 font-bold">&gt;</span>
                      <div className="h-2 bg-indigo-500/35 rounded w-3/4" />
                    </div>
                    <div className="h-2 bg-muted-foreground/45 rounded w-4/5" />
                    <div className="flex items-center gap-1">
                      <span className="text-emerald-500 font-bold">-</span>
                      <div className="h-2 bg-muted-foreground/45 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Live Output & SEO Meter Pane */}
              <div className="space-y-3">
                <div className="rounded-xl border border-border/50 bg-card/75 p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-3 border-b border-border/30 pb-2">
                    <Eye size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-foreground">معاينة</span>
                  </div>

                  {/* Rendered Document Mock Lines */}
                  <div className="space-y-2.5">
                    <div className="h-3.5 bg-primary/35 rounded-md w-3/5" />
                    <div className="h-2 bg-muted-foreground/38 rounded w-full" />
                    <div className="h-2 bg-muted-foreground/38 rounded w-11/12" />
                    <div className="h-2 bg-muted-foreground/35 rounded w-4/5" />
                  </div>
                </div>

                {/* Dynamic SEO Badge Meter */}
                <div
                  className="landing-enter-up-sm rounded-xl border border-emerald-500/20 bg-emerald-500/9 dark:bg-emerald-500/14 p-3.5 flex items-center justify-between shadow-xs"
                  style={{ ['--ld' as string]: '1.2s' } as React.CSSProperties}
                >
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      تحسين محرِّكات البحث
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/14 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    92/100
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Ambient Badge Elements */}
          {[
            { icon: FileText, label: 'دعم الـ Markdown', delay: 0 },
            { icon: Sparkle, label: 'ذكاء اصطناعي', delay: 0.4 },
            { icon: CheckCircle, label: 'نشر فوري', delay: 0.8 },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="landing-float absolute -z-10"
                style={
                  {
                    left: i === 0 ? '-8%' : i === 1 ? '82%' : '42%',
                    top: i === 0 ? '-8%' : i === 1 ? '12%' : '94%',
                    ['--landing-float-dur' as string]: `${4 + i}s`,
                    ['--landing-float-y' as string]: `${-10 + i * 4}px`,
                    ['--ld' as string]: `${item.delay}s`,
                  } as React.CSSProperties
                }
              >
                <div className="flex items-center gap-2 rounded-xl border border-white/20 dark:border-white/10 bg-background/90 dark:bg-neutral-900/90 px-3.5 py-2 shadow-xl text-xs font-medium text-foreground">
                  <Icon size={18} className="text-primary" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </HeroSection>
  );
}
