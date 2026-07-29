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
      router.push('/linksnap/app');
    } else {
      router.push('/auth/login?redirect=/linksnap');
    }
  };

  return (
    <section
      className="relative overflow-hidden border-t border-border/40 bg-background/50 backdrop-blur-xl"
      aria-labelledby="cta-heading"
    >
      {/* Top ambient highlight boundary line */}
      <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />

      {/* Atmospheric mesh grid & dynamic radial lighting */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-137.5 md:w-175 h-80 sm:h-137.5 md:h-175 bg-primary/10 rounded-full blur-[100px] sm:blur-[130px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-50 sm:w-87.5 h-50 sm:h-87.5 bg-primary/15 rounded-full blur-[70px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 md:py-36 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center"
        >
          {/* Feature Badge */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className="group relative inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs sm:text-sm font-semibold tracking-wide mb-8 backdrop-blur-md shadow-sm shadow-primary/10 hover:bg-primary/15 hover:border-primary/30 transition-all duration-300 cursor-default"
          >
            <Sparkle
              size={16}
              weight="fill"
              className="text-primary animate-pulse transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110"
            />
            <span>ابدأ التَّتبُّع اليوم</span>
          </motion.div>

          {/* Main Headline */}
          <h2
            id="cta-heading"
            className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.15] sm:leading-[1.1] mb-6 text-foreground text-balance max-w-4xl"
          >
            هل أنت مستعد{' '}
            <span className="bg-linear-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent gradient-text">
              لتتبُّع كل نقرة؟
            </span>
          </h2>

          {/* Subtitle Body */}
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground/90 max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed font-normal text-balance">
            انضم إلى آلاف مديري الرَّوابط الأذكياء. اختصِر، تتبَّع، وحسِّن روابطك باستخدام منصَّة
            التَّحليلات القويَّة من رؤية رقمية.
          </p>

          {/* Interactive Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4"
          >
            <Button
              size="xl"
              onClick={handleCTA}
              className="cta-glow group relative inline-flex items-center justify-center gap-2.5 text-base sm:text-lg font-semibold px-8 sm:px-12 h-14 sm:h-16 rounded-full transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20 hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span>{user ? 'لوحة التَّحكُّم' : 'أنشِئ حسابك'}</span>
              <ArrowLeft
                size={20}
                weight="bold"
                className="arrow-bounce transition-transform duration-300 group-hover:-translate-x-1 rtl:group-hover:translate-x-1 shrink-0"
              />
            </Button>

            <Button
              size="xl"
              variant="outline"
              onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="group inline-flex items-center justify-center text-base sm:text-lg font-medium h-14 sm:h-16 px-8 sm:px-10 rounded-full border border-border/80 bg-background/60 hover:bg-accent/80 hover:border-border transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              كيف يعمل
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
