import { CircleCheckBig, Flame } from 'lucide-react';
import { GlowOrb } from '@/frontend/ui/landing-shared/GlowOrb';
import { HeroSection } from '@/frontend/ui/landing-shared/HeroSection';
import { LandingCta } from '@/frontend/ui/landing-shared/LandingCta';

const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const habitData = [
  { name: 'تأمُّل', done: [true, true, true, true, false, true, true], color: 'bg-primary' },
  { name: 'تمارين', done: [true, false, true, true, true, false, true], color: 'bg-accent-indigo' },
  {
    name: 'قراءة',
    done: [true, true, false, true, true, true, false],
    color: 'bg-accent-purple',
  },
];

export function Hero() {
  return (
    <HeroSection
      sectionClassName="relative min-h-dvh flex items-center justify-center overflow-hidden bg-background text-foreground pt-24 md:pt-32 pb-12 lg:py-0 selection:bg-primary/35 selection:text-primary"
      decor={
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

          {/* Static glows — pulsing 400-576px blurred layers recomposites the
              whole texture every frame for an effect invisible at 60% opacity. */}
          <GlowOrb className="opacity-60 select-none w-md h-112 sm:w-xl sm:h-144 bg-primary/35 top-1/4 -left-36 sm:-left-48" />
          <GlowOrb className="opacity-60 select-none w-[24rem] h-96 sm:w-lg sm:h-128 bg-indigo-500/25 bottom-1/4 -right-36 sm:-right-40" />
          <GlowOrb className="opacity-60 select-none w-80 h-80 bg-purple-500/14 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </>
      }
      containerClassName="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      gridClassName="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center"
    >
      {/* Main Hero Typography & Action Controls */}
      <div className="landing-enter-up lg:col-span-6 xl:col-span-7 text-center lg:text-right flex flex-col items-center lg:items-start">
        {/* High-Contrast Gradient Typography */}
        <h1
          className="landing-enter-up text-4xl xs:text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-arabic leading-tight mb-6 text-foreground"
          style={{ ['--ld' as string]: '0.25s' } as React.CSSProperties}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="bg-linear-to-l from-primary via-indigo-500 to-purple-600 bg-clip-text text-transparent inline-block drop-shadow-xs">
              تتبَّع.
            </span>
            <span className="text-foreground inline-block">واظب.</span>
            <span className="bg-linear-to-l from-purple-600 via-indigo-500 to-primary bg-clip-text text-transparent inline-block drop-shadow-xs">
              ازدَهِر.
            </span>
          </div>
        </h1>

        {/* Subtitle Description */}
        <h2
          className="landing-enter-up-sm text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8 sm:mb-10 font-normal text-balance"
          style={{ ['--ld' as string]: '0.4s' } as React.CSSProperties}
        >
          ابنِ العادات اليوميَّة وحافظ عليها مع تتبُّع السَّلاسل والتَّقويمات البصريَّة والتَّحفيز
          الذي يدفعك للاستمرار.
        </h2>

        {/* Micro-Interactive Action Buttons */}
        <div
          className="landing-enter-up-sm flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
          style={{ ['--ld' as string]: '0.55s' } as React.CSSProperties}
        >
          <LandingCta
            appPath="/habitflow/app"
            loginRedirect="/habitflow/app"
            scrollTarget="features"
            primaryClassName="group relative h-13 px-8 text-base font-bold rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all duration-300 ease-out flex items-center justify-center gap-3 w-full sm:w-auto cursor-pointer"
            loggedOutLabel="ابدأ التَّتبُّع مجَّانًا"
            loggedInLabel="لوحة التَّحكُّم"
            arrowClassName="transition-transform duration-300 group-hover:-translate-x-1.5"
            secondaryClassName="h-13 px-8 text-base font-medium rounded-full border-border/80 bg-background/75 hover:bg-muted/88 hover:border-border hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all duration-300 ease-out w-full sm:w-auto cursor-pointer"
            secondaryLabel="اعرف المزيد"
          />
        </div>
      </div>

      {/* Interactive Dynamic App Preview Card */}
      <div
        className="landing-enter-scale lg:col-span-6 xl:col-span-5 w-full"
        style={{ ['--ld' as string]: '0.35s' } as React.CSSProperties}
      >
        <div className="relative w-full max-w-md sm:max-w-lg mx-auto lg:max-w-none group">
          {/* Backlight Card Halo Glow */}
          <div className="absolute -inset-1 rounded-3xl bg-linear-to-r from-primary/30 via-indigo-500/20 to-purple-500/30 opacity-60 blur-xl group-hover:opacity-100 transition duration-1000" />

          <div
            className="landing-float relative rounded-2xl sm:rounded-3xl p-5 sm:p-7 bg-card/92 border border-border/60 shadow-2xl shadow-primary/5 ring-1 ring-white/10 dark:ring-white/5 overflow-hidden"
            style={
              {
                ['--landing-float-dur' as string]: '6s',
                ['--landing-float-y' as string]: '-10px',
              } as React.CSSProperties
            }
          >
            {/* Top Refraction Highlight Line */}
            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/15 to-transparent" />

            {/* Glassmorphic Window Controls */}
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/88 shadow-xs" />
                <div className="w-3 h-3 rounded-full bg-amber-500/88 shadow-xs" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/88 shadow-xs" />
              </div>
              <div className="px-2.5 py-1 rounded-md bg-muted/75 text-[11px] font-mono font-medium text-muted-foreground border border-border/30">
                royaraqamia.com
              </div>
            </div>

            {/* Weekly Streak Header */}
            <div className="flex items-center justify-between mb-5 bg-muted/45 p-3.5 rounded-xl border border-border/30">
              <span className="text-xs sm:text-sm font-bold text-foreground">هذا الأسبوع</span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-500/14 border border-orange-500/20 text-orange-500 text-xs sm:text-sm font-bold shadow-xs">
                <Flame size={18} fill="currentColor" className="text-orange-500 animate-pulse" />
                <span>12</span>
              </div>
            </div>

            {/* Weekday Alignment Header */}
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center mb-3 px-1">
              <div />
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
                {weekDays.map((day, i) => (
                  <span
                    key={i}
                    className="text-[11px] font-bold text-muted-foreground w-7 sm:w-8 text-center uppercase tracking-wider"
                  >
                    {day}
                  </span>
                ))}
              </div>
            </div>

            {/* Habit Tracking Rows */}
            <div className="space-y-3">
              {habitData.map((habit, i) => (
                <div
                  key={habit.name}
                  className="landing-enter-left group/row rounded-xl p-3 bg-muted/35 hover:bg-muted/55 border border-border/40 hover:border-border/80 transition-all duration-300"
                  style={{ ['--ld' as string]: `${0.6 + i * 0.12}s` } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs sm:text-sm font-bold text-foreground group-hover/row:text-primary transition-colors">
                      {habit.name}
                    </span>
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-muted/88 text-muted-foreground border border-border/20">
                      {habit.done.filter(Boolean).length}/{habit.done.length}
                    </span>
                  </div>

                  {/* Fluid Square Day Cells */}
                  <div className="flex items-center justify-between gap-1 sm:gap-1.5">
                    {habit.done.map((done, j) => (
                      <div
                        key={j}
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                          done
                            ? `${habit.color} text-white shadow-xs scale-100 ring-1 ring-white/20`
                            : 'bg-muted/65 text-muted-foreground/40 hover:bg-muted/88'
                        }`}
                      >
                        {done ? (
                          <CircleCheckBig
                            size={16}
                            fill="currentColor"
                            className="drop-shadow-xs"
                          />
                        ) : (
                          <span className="opacity-40">•</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Best Streak Metrics Footer */}
            <div
              className="landing-enter-fade mt-5 pt-4 border-t border-border/40 flex items-center justify-between text-xs sm:text-sm"
              style={{ ['--ld' as string]: '1.1s' } as React.CSSProperties}
            >
              <div className="flex items-center gap-2 text-muted-foreground font-medium">
                <CircleCheckBig size={16} className="text-primary" />
                <span>أفضل سلسلة</span>
              </div>
              <span className="text-base font-bold bg-linear-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent font-mono">
                21 days
              </span>
            </div>
          </div>
        </div>
      </div>
    </HeroSection>
  );
}
