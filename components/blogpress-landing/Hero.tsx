'use client';

import { motion } from 'motion/react';
import { ArrowLeft, FileText, Sparkle, CheckCircle, Code, Eye } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/shared/session-provider';
import { cn } from '@/lib/utils';

function GlowOrb({
  className,
  ...props
}: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('absolute rounded-full blur-3xl pointer-events-none', className)}
      {...props}
    />
  );
}

export function Hero() {
  const router = useRouter();
  const { user } = useSession();

  const handleCTA = () => {
    if (user) {
      router.push('/blogpress/app');
    } else {
      router.push('/auth/login?redirect=/blogpress');
    }
  };

  return (
    <section
      aria-label="Hero"
      className="relative min-h-dvh w-full flex items-center justify-center overflow-hidden bg-background text-foreground pt-24 md:pt-32 pb-12 lg:py-0"
    >
      {/* Premium Background Lighting & Dot Grid Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Multi-layered Ambient Glow Orbs */}
      <GlowOrb className="w-125 h-125 bg-primary/20 top-1/4 -right-48 animate-pulse-slow blur-[120px]" />
      <GlowOrb
        className="w-112.5 h-112.5 bg-indigo-500/15 bottom-1/4 -left-40 animate-pulse-slow blur-[120px]"
        style={{ animationDelay: '2s' }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Main Content Column */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 xl:col-span-6 text-center lg:text-right flex flex-col items-center lg:items-start"
          >
            {/* Live Pill Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/10 hover:bg-primary/15 border border-primary/20 hover:border-primary/30 text-primary text-xs sm:text-sm font-medium mb-8 transition-all duration-300 backdrop-blur-md cursor-default shadow-xs"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="tracking-wide">منصَّة التَّدوين</span>
            </motion.div>

            {/* High-Impact Typography Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl xs:text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-arabic leading-tight mb-6 text-foreground"
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
            </motion.h1>

            {/* Supporting Subtitle */}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mb-10 font-normal"
            >
              محرِّر Markdown متكامل مع إدارة المسودَّات وتحسين محرِّكات البحث ونشر احترافي — كل ما
              تحتاجه في مكان واحد.
            </motion.h2>

            {/* Tactile Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            >
              <Button
                size="xl"
                onClick={handleCTA}
                className="group relative w-full sm:w-auto text-base font-semibold px-8 py-6 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <span>{user ? 'لوحة التَّحكُّم' : 'ابدأ الكتابة مجَّانًا'}</span>
                <ArrowLeft
                  size={20}
                  weight="bold"
                  className="transition-transform duration-300 ease-out group-hover:-translate-x-1.5"
                />
              </Button>
              <Button
                size="xl"
                variant="outline"
                onClick={() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto text-base font-medium px-8 py-6 rounded-full border-border/80 bg-background/50 hover:bg-accent/80 hover:border-border backdrop-blur-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                اعرف المزيد
              </Button>
            </motion.div>
          </motion.div>

          {/* Interactive Dynamic Editor Preview Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 xl:col-span-6 relative"
          >
            <div className="relative perspective-3d">
              {/* Diffused Outer Aura */}
              <div className="absolute -inset-1 rounded-3xl bg-linear-to-r from-primary/30 via-indigo-500/20 to-primary/30 blur-2xl opacity-50 hover:opacity-100 transition duration-1000" />

              <motion.div
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="relative rounded-2xl border border-white/20 dark:border-white/10 bg-background/80 dark:bg-neutral-900/80 backdrop-blur-xl p-6 shadow-2xl shadow-primary/10 transform-gpu"
                style={{ transform: 'rotateY(-6deg) rotateX(3deg)' }}
              >
                {/* Window Control Bar */}
                <div className="flex items-center justify-between border-b border-border/40 pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/90 shadow-xs" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/90 shadow-xs" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/90 shadow-xs" />
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-muted/60 border border-border/30 text-[11px] font-mono text-muted-foreground dir-ltr">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    royaraqamia.com
                  </div>
                  <div className="w-12" />
                </div>

                {/* Editor & Live Render Split Columns */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Left: Code Editor Pane */}
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-3 border-b border-border/30 pb-2">
                        <div className="flex items-center gap-1.5">
                          <Code size={14} className="text-primary" />
                          <span className="text-xs font-semibold font-mono text-foreground">
                            editor.md
                          </span>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          مسودَّة
                        </span>
                      </div>

                      {/* Syntactical Code Placeholder Lines */}
                      <div className="space-y-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="text-primary font-bold">#</span>
                          <div className="h-2.5 bg-foreground/80 rounded w-2/3" />
                        </div>
                        <div className="h-2 bg-muted-foreground/30 rounded w-full" />
                        <div className="h-2 bg-muted-foreground/30 rounded w-5/6" />
                        <div className="flex items-center gap-1">
                          <span className="text-indigo-400 font-bold">&gt;</span>
                          <div className="h-2 bg-indigo-500/20 rounded w-3/4" />
                        </div>
                        <div className="h-2 bg-muted-foreground/30 rounded w-4/5" />
                        <div className="flex items-center gap-1">
                          <span className="text-emerald-500 font-bold">-</span>
                          <div className="h-2 bg-muted-foreground/30 rounded w-1/2" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Live Output & SEO Meter Pane */}
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center gap-1.5 mb-3 border-b border-border/30 pb-2">
                        <Eye size={14} className="text-primary" />
                        <span className="text-xs font-semibold text-foreground">معاينة</span>
                      </div>

                      {/* Rendered Document Mock Lines */}
                      <div className="space-y-2.5">
                        <div className="h-3.5 bg-primary/20 rounded-md w-3/5" />
                        <div className="h-2 bg-muted-foreground/25 rounded w-full" />
                        <div className="h-2 bg-muted-foreground/25 rounded w-11/12" />
                        <div className="h-2 bg-muted-foreground/20 rounded w-4/5" />
                      </div>
                    </div>

                    {/* Dynamic SEO Badge Meter */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2, duration: 0.5 }}
                      className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 p-3.5 flex items-center justify-between backdrop-blur-sm shadow-xs"
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
                      <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        92/100
                      </span>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* Floating Ambient Badge Elements */}
              {[
                { icon: FileText, label: 'دعم الـ Markdown', delay: 0 },
                { icon: Sparkle, label: 'ذكاء اصطناعي', delay: 0.4 },
                { icon: CheckCircle, label: 'نشر فوري', delay: 0.8 },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={i}
                    className="absolute -z-10"
                    style={{
                      left: i === 0 ? '-8%' : i === 1 ? '82%' : '42%',
                      top: i === 0 ? '-8%' : i === 1 ? '12%' : '94%',
                    }}
                    animate={{ y: [0, -10 + i * 4, 0] }}
                    transition={{
                      duration: 4 + i,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: item.delay,
                    }}
                  >
                    <div className="flex items-center gap-2 rounded-xl border border-white/20 dark:border-white/10 bg-background/90 dark:bg-neutral-900/90 backdrop-blur-md px-3.5 py-2 shadow-xl text-xs font-medium text-foreground">
                      <Icon size={18} className="text-primary" />
                      <span className="whitespace-nowrap">{item.label}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
