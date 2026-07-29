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
      router.push('/habitflow/app');
    } else {
      router.push('/auth/login?redirect=/habitflow');
    }
  };

  return (
    <section className="relative w-full overflow-hidden border-t border-border/40 bg-background py-20 sm:py-28 lg:py-36">
      {/* Ambient background glows & subtle technical dot matrix grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-150 sm:w-200 lg:w-250 h-125 bg-linear-to-b from-primary/15 via-primary/5 to-transparent rounded-full blur-3xl opacity-80" />
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-100 sm:w-150 h-75 bg-primary/10 rounded-full blur-3xl opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[24px_24px] opacity-30 mask-[radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-3xl border border-border/60 bg-card/40 backdrop-blur-2xl p-8 sm:p-14 lg:p-20 text-center shadow-2xl shadow-primary/5 ring-1 ring-white/10 overflow-hidden"
        >
          {/* Top subtle highlight rim */}
          <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />

          {/* Sparkle Badge */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className="inline-flex items-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs sm:text-sm font-semibold tracking-wide shadow-xs transition-all duration-300 hover:bg-primary/15 hover:border-primary/40 hover:scale-[1.02] cursor-default">
              <Sparkle size={16} weight="fill" className="text-primary animate-pulse" />
              <span>ابدأ بناء العادات</span>
            </div>
          </motion.div>

          {/* Heading */}
          <h2 className="mt-6 text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.15] text-foreground max-w-3xl mx-auto text-balance">
            هل أنت مستعد لبناء{' '}
            <span className="bg-linear-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent drop-shadow-xs">
              عادات أفضل؟
            </span>
          </h2>

          {/* Description */}
          <p className="mt-5 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed text-balance font-normal">
            انضم إلى آلاف الأشخاص الذين يستخدمون منتجنا لتتبُّع روتينهم اليومي، وبناء السَّلاسل،
            وتغيير حياتهم يومًا بعد يوم.
          </p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
          >
            <Button
              size="xl"
              onClick={handleCTA}
              className="group relative text-base sm:text-lg font-semibold px-8 sm:px-10 h-14 sm:h-16 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span>{user ? 'لوحة التَّحكُّم' : 'أنشِئ حسابك'}</span>
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
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-base sm:text-lg font-medium h-14 sm:h-16 px-8 sm:px-10 rounded-full border-border/80 hover:bg-accent/80 hover:text-accent-foreground transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              كيف يعمل
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
