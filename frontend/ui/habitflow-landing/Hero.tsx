'use client';

import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle, Fire } from '@phosphor-icons/react';
import { Button } from '@/frontend/ui/ui/button';
import { GlowOrb } from '@/frontend/ui/landing-shared/GlowOrb';
import { useLandingCta } from '@/frontend/ui/landing-shared/useLandingCta';

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
  const { user, handleCTA } = useLandingCta('/habitflow/app', '/habitflow');

  return (
    <section className="relative min-h-dvh flex items-center justify-center overflow-hidden bg-background text-foreground pt-24 md:pt-32 pb-12 lg:py-0 selection:bg-primary/20 selection:text-primary">
      {/* Ambient Grid Background Layer */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Layered Motion Ambient Light Orbs */}
      <GlowOrb
        className="opacity-60 select-none w-md h-112 sm:w-xl sm:h-144 bg-primary/20 top-1/4 -left-36 sm:-left-48 animate-pulse"
        style={{ animationDuration: '8s' }}
      />
      <GlowOrb
        className="opacity-60 select-none w-[24rem] h-96 sm:w-lg sm:h-128 bg-indigo-500/15 bottom-1/4 -right-36 sm:-right-40 animate-pulse"
        style={{ animationDuration: '10s', animationDelay: '2s' }}
      />
      <GlowOrb className="opacity-60 select-none w-80 h-80 bg-purple-500/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Main Hero Typography & Action Controls */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 xl:col-span-7 text-center lg:text-right flex flex-col items-center lg:items-start"
          >
            {/* Pulsing Status Pill */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/25 backdrop-blur-md text-primary text-xs sm:text-sm font-semibold tracking-wide shadow-xs hover:bg-primary/15 transition-all duration-300 cursor-default mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span>تتبُّع العادات</span>
            </motion.div>

            {/* High-Contrast Gradient Typography */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl xs:text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-arabic leading-tight mb-6 text-foreground"
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
            </motion.h1>

            {/* Subtitle Description */}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8 sm:mb-10 font-normal text-balance"
            >
              ابنِ العادات اليوميَّة وحافظ عليها مع تتبُّع السَّلاسل والتَّقويمات البصريَّة
              والتَّحفيز الذي يدفعك للاستمرار.
            </motion.h2>

            {/* Micro-Interactive Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            >
              <Button
                size="xl"
                onClick={handleCTA}
                className="group relative h-13 px-8 text-base font-semibold rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all duration-300 ease-out flex items-center justify-center gap-3 w-full sm:w-auto cursor-pointer"
              >
                <span>{user ? 'لوحة التَّحكُّم' : 'ابدأ التَّتبُّع مجَّانًا'}</span>
                <ArrowLeft
                  size={20}
                  weight="bold"
                  className="transition-transform duration-300 group-hover:-translate-x-1.5"
                />
              </Button>
              <Button
                size="xl"
                variant="outline"
                onClick={() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="h-13 px-8 text-base font-medium rounded-full border-border/80 bg-background/60 backdrop-blur-md hover:bg-muted/80 hover:border-border hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all duration-300 ease-out w-full sm:w-auto cursor-pointer"
              >
                اعرف المزيد
              </Button>
            </motion.div>
          </motion.div>

          {/* Interactive Dynamic App Preview Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 xl:col-span-5 w-full"
          >
            <div className="relative w-full max-w-md sm:max-w-lg mx-auto lg:max-w-none group">
              {/* Backlight Card Halo Glow */}
              <div className="absolute -inset-1 rounded-3xl bg-linear-to-r from-primary/30 via-indigo-500/20 to-purple-500/30 opacity-60 blur-xl group-hover:opacity-100 transition duration-1000" />

              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="relative rounded-2xl sm:rounded-3xl p-5 sm:p-7 bg-card/85 backdrop-blur-2xl border border-border/60 shadow-2xl shadow-primary/5 ring-1 ring-white/10 dark:ring-white/5 overflow-hidden"
              >
                {/* Top Refraction Highlight Line */}
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/15 to-transparent" />

                {/* Glassmorphic Window Controls */}
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80 shadow-xs" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-xs" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-xs" />
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-muted/60 text-[11px] font-mono font-medium text-muted-foreground border border-border/30">
                    royaraqamia.com
                  </div>
                </div>

                {/* Weekly Streak Header */}
                <div className="flex items-center justify-between mb-5 bg-muted/30 p-3.5 rounded-xl border border-border/30">
                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                    هذا الأسبوع
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 text-xs sm:text-sm font-bold shadow-xs">
                    <Fire size={18} weight="fill" className="text-orange-500 animate-pulse" />
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
                        className="text-[11px] font-semibold text-muted-foreground w-7 sm:w-8 text-center uppercase tracking-wider"
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Habit Tracking Rows */}
                <div className="space-y-3">
                  {habitData.map((habit, i) => (
                    <motion.div
                      key={habit.name}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.12, duration: 0.5 }}
                      className="group/row rounded-xl p-3 bg-muted/20 hover:bg-muted/40 border border-border/40 hover:border-border/80 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs sm:text-sm font-semibold text-foreground group-hover/row:text-primary transition-colors">
                          {habit.name}
                        </span>
                        <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-muted/80 text-muted-foreground border border-border/20">
                          {habit.done.filter(Boolean).length}/{habit.done.length}
                        </span>
                      </div>

                      {/* Fluid Square Day Cells */}
                      <div className="flex items-center justify-between gap-1 sm:gap-1.5">
                        {habit.done.map((done, j) => (
                          <div
                            key={j}
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                              done
                                ? `${habit.color} text-white shadow-xs scale-100 ring-1 ring-white/20`
                                : 'bg-muted/50 text-muted-foreground/40 hover:bg-muted/80'
                            }`}
                          >
                            {done ? (
                              <CheckCircle size={16} weight="fill" className="drop-shadow-xs" />
                            ) : (
                              <span className="opacity-40">•</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Best Streak Metrics Footer */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1, duration: 0.5 }}
                  className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    <CheckCircle size={16} className="text-primary" />
                    <span>أفضل سلسلة</span>
                  </div>
                  <span className="text-base font-bold bg-linear-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent font-mono">
                    21 days
                  </span>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
