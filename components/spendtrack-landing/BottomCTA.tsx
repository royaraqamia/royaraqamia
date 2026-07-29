'use client';

import { motion } from 'motion/react';
import { ArrowLeft, Sparkle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/shared/session-provider';

export function BottomCTA() {
  const router = useRouter();
  const { user } = useSession();

  const handleCTA = () => {
    if (user) {
      router.push('/spendtrack/app');
    } else {
      router.push('/auth/login?redirect=/spendtrack');
    }
  };

  return (
    <section
      aria-label="Call to action section"
      className="relative overflow-hidden border-t border-border/40 bg-background py-20 sm:py-28 lg:py-36 text-foreground"
    >
      {/* Ambient Radial Spotlight & Structural Grid Overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-125 h-125 sm:w-187.5 sm:h-187.5 bg-primary/10 rounded-full blur-[130px] opacity-75" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-px bg-linear-to-r from-transparent via-primary/30 to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-[0.15]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center"
        >
          {/* Pill Badge */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs sm:text-sm font-medium mb-8 backdrop-blur-md transition-all duration-300 hover:bg-primary/15 hover:border-primary/35 hover:shadow-sm hover:shadow-primary/20"
          >
            <Sparkle
              size={16}
              weight="fill"
              className="text-primary transition-transform duration-300 group-hover:rotate-12"
            />
            <span>ابدأ التَّتبُّع اليوم</span>
          </motion.div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.15] sm:leading-[1.1] mb-6 max-w-3xl text-balance">
            هل أنت مستعد للتَّحكُّم{' '}
            <span className="bg-linear-to-r from-primary via-primary/85 to-primary/65 bg-clip-text text-transparent">
              بأموالك؟
            </span>
          </h2>

          {/* Description */}
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground/90 max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed text-pretty font-normal">
            انضم إلى آلاف المستخدمين الذين يستخدمون منتجنا لتسجيل المصروفات وتحليل الأنماط واتِّخاذ
            قرارات ماليَّة أذكى كل يوم.
          </p>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4"
          >
            <Button
              size="xl"
              onClick={handleCTA}
              className="group relative inline-flex items-center justify-center gap-2.5 h-14 sm:h-16 px-8 sm:px-10 text-base sm:text-lg font-semibold rounded-full shadow-lg shadow-primary/20 transition-all duration-300 ease-out hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span>{user ? 'لوحة التَّحكُّم' : 'أنشِئ حسابك'}</span>
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
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="h-14 sm:h-16 px-8 sm:px-10 text-base sm:text-lg font-medium rounded-full border-border/80 bg-background/60 hover:bg-accent/80 hover:text-accent-foreground backdrop-blur-md transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              كيف يعمل
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
