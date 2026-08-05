'use client';

import { motion } from 'motion/react';
import { ArrowLeft, Wallet } from '@phosphor-icons/react';
import { Button } from '@/frontend/ui/primitives/button';
import { GlowOrb } from '@/frontend/ui/landing-shared/GlowOrb';
import { HeroSection } from '@/frontend/ui/landing-shared/HeroSection';
import { useLandingCta } from '@/frontend/ui/landing-shared/useLandingCta';
import { cn } from '@/frontend/shared/cn';

const transactions = [
  { desc: 'بقالة', amount: '-$84.50', cat: 'طعام', color: 'text-accent-purple' },
  { desc: 'راتب', amount: '+$3,200', cat: 'دخل', color: 'text-primary' },
  { desc: 'نتفلكس', amount: '-$15.99', cat: 'ترفيه', color: 'text-primary' },
  { desc: 'وقود', amount: '-$42.00', cat: 'مواصلات', color: 'text-accent-indigo' },
];

export function Hero() {
  const { user, handleCTA } = useLandingCta('/spendtrack/app', '/spendtrack');

  return (
    <HeroSection
      sectionAriaLabel="SpendTrack Hero Section"
      sectionClassName="relative min-h-dvh flex items-center justify-center overflow-hidden pt-24 md:pt-32 pb-12 lg:py-0 w-full bg-background"
      decor={
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"
          />

          <GlowOrb className="transform-gpu w-72 h-72 sm:w-96 sm:h-96 bg-primary/20 top-1/4 -right-24 sm:-right-48 animate-pulse-slow" />
          <GlowOrb
            className="transform-gpu w-64 h-64 sm:w-80 sm:h-80 bg-accent-indigo/15 bottom-1/4 -left-20 sm:-left-40 animate-pulse-slow"
            style={{ animationDelay: '2s' }}
          />
        </>
      }
      containerClassName="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 container-padding"
      gridClassName="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center"
    >
      {/* Main Hero Content */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="lg:col-span-7 text-center lg:text-right flex flex-col items-center lg:items-start"
      >
        {/* Status Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md text-primary text-xs sm:text-sm font-medium mb-6 sm:mb-8 hover:bg-primary/15 transition-colors"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          <span>تتبُّع المصروفات</span>
        </motion.div>

        {/* Typography Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl xs:text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-arabic leading-tight mb-6 text-foreground"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="gradient-text bg-linear-to-r from-primary via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              تتبَّع.
            </span>
            <span>حلِّل.</span>
            <span className="gradient-text bg-linear-to-r from-primary via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              وفِّر.
            </span>
          </div>
        </motion.h1>

        {/* Subtitle */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 mb-8 sm:mb-10 font-normal"
        >
          سجِّل المصروفات حسب التَّصنيف، وصوِّر أنماط الإنفاق، وتحكَّم في أموالك من خلال تحليلات
          شهريَّة واضحة.
        </motion.h2>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
        >
          <Button
            size="xl"
            onClick={handleCTA}
            className="group relative w-full sm:w-auto cta-glow text-base px-8 py-6 rounded-full font-semibold shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span>{user ? 'لوحة التَّحكُّم' : 'ابدأ التَّتبُّع مجَّانًا'}</span>
            <ArrowLeft
              size={20}
              weight="bold"
              className="arrow-bounce transition-transform duration-300 group-hover:-translate-x-1"
            />
          </Button>
          <Button
            size="xl"
            variant="outline"
            onClick={() => {
              document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full sm:w-auto text-base px-8 py-6 rounded-full font-medium border-border/80 bg-background/60 backdrop-blur-md hover:bg-accent hover:text-accent-foreground transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            اعرف المزيد
          </Button>
        </motion.div>
      </motion.div>

      {/* Interactive Dashboard Mockup Column */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="lg:col-span-5 w-full max-w-md sm:max-w-lg mx-auto lg:max-w-none"
      >
        <div className="relative">
          {/* Card Ambient Underglow */}
          <div
            aria-hidden="true"
            className="absolute -inset-1 rounded-3xl bg-linear-to-r from-primary/30 via-purple-500/20 to-indigo-500/30 blur-xl opacity-75 transition duration-1000"
          />

          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="glass-card relative rounded-2xl sm:rounded-3xl p-5 sm:p-7 bg-card/70 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl shadow-primary/10 overflow-hidden transform-gpu"
          >
            {/* Window Control Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/40">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block shadow-xs" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block shadow-xs" />
                <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block shadow-xs" />
              </div>
              <div className="ms-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border/40 text-xs font-mono text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                royaraqamia.com
              </div>
            </div>

            {/* Balance Header */}
            <div className="flex items-center justify-between mb-6 gap-2">
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-muted-foreground block mb-0.5">
                  آخر النَّشاطات
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight gradient-text bg-linear-to-r from-foreground to-foreground/80 bg-clip-text">
                  $3,057
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold whitespace-nowrap">
                المجموع الحالي
              </div>
            </div>

            {/* Interactive Transactions List */}
            <div className="space-y-2.5">
              {transactions.map((tx, i) => (
                <motion.div
                  key={tx.desc}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.12, duration: 0.4 }}
                  className="glass rounded-xl sm:rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 bg-background/50 hover:bg-background/80 border border-border/30 hover:border-border/60 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-primary/20 transition-all duration-200">
                      <Wallet size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-foreground block truncate">
                        {tx.desc}
                      </span>
                      <span className="text-xs text-muted-foreground block truncate">{tx.cat}</span>
                    </div>
                  </div>
                  <span
                    className={cn('text-sm font-bold tracking-tight shrink-0 dir-ltr', tx.color)}
                  >
                    {tx.amount}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Monthly Budget Visual Progress */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4, duration: 0.5 }}
              className="mt-6 pt-4 border-t border-border/50 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    الميزانيَّة الشَّهريَّة
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-bold text-primary">مُستهلَك 68%</span>
              </div>

              <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden p-0.5 border border-border/20">
                <div className="h-full rounded-full bg-linear-to-r from-primary to-purple-500 w-[68%] transition-all duration-1000 ease-out" />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </HeroSection>
  );
}
