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
      router.push('/blogpress/app');
    } else {
      router.push('/auth/login?redirect=/blogpress');
    }
  };

  return (
    <section
      aria-label="Call to Action"
      className="relative overflow-hidden py-20 sm:py-28 lg:py-36 border-t border-border/40 bg-background transition-colors duration-500"
    >
      {/* Background Lighting & Radial Mesh Texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(255,255,255,0))]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-150 h-80 sm:h-150 bg-primary/10 rounded-full blur-[100px] sm:blur-[140px] pointer-events-none -z-10 opacity-70" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Modern SaaS Glass Container */}
        <div className="relative rounded-3xl border border-border/60 bg-card/40 backdrop-blur-xl p-8 sm:p-12 md:p-16 lg:p-20 shadow-2xl shadow-primary/5 overflow-hidden text-center group/card">
          {/* Ambient Inner Border Light */}
          <div className="absolute -inset-px rounded-3xl bg-linear-to-b from-primary/20 via-border/30 to-transparent opacity-60 pointer-events-none -z-10" />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center"
          >
            {/* Interactive Pill Badge */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs sm:text-sm font-medium tracking-wide shadow-xs backdrop-blur-md mb-6 sm:mb-8 hover:bg-primary/15 hover:border-primary/40 transition-all duration-300 select-none cursor-default"
            >
              <Sparkle size={16} weight="fill" className="text-primary shrink-0 animate-pulse" />
              <span>ابدأ النَّشر اليوم</span>
            </motion.div>

            {/* Typography & Heading */}
            <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.15] sm:leading-[1.12] mb-6 sm:mb-8 text-foreground text-balance">
              هل أنت مستعد لمشاركة{' '}
              <span className="gradient-text bg-linear-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent drop-shadow-xs">
                صوتك؟
              </span>
            </h2>

            {/* Subtitle Paragraph */}
            <p className="text-base sm:text-xl text-muted-foreground/90 max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed sm:leading-loose text-balance">
              انضم إلى المبدعين الذين يثقون في منتجنا للكتابة والنَّشر وتنمية جمهورهم بأدوات
              Markdown قويَّة وتحسين محرِّكات البحث.
            </p>

            {/* CTA Button Group */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 sm:gap-5 max-w-md sm:max-w-none mx-auto w-full"
            >
              <Button
                size="xl"
                onClick={handleCTA}
                className="group relative inline-flex items-center justify-center gap-3 h-14 sm:h-16 px-8 sm:px-10 rounded-full bg-primary text-primary-foreground font-semibold text-base sm:text-lg shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 border border-primary/30 cursor-pointer w-full sm:w-auto"
              >
                <span className="relative z-10">{user ? 'لوحة التَّحكُّم' : 'أنشِئ حسابك'}</span>
                <ArrowLeft
                  size={20}
                  weight="bold"
                  className="relative z-10 group-hover:-translate-x-1.5 transition-transform duration-300 shrink-0"
                />
              </Button>

              <Button
                size="xl"
                variant="outline"
                onClick={() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center justify-center h-14 sm:h-16 px-8 sm:px-10 rounded-full border border-border/80 bg-background/60 backdrop-blur-md hover:bg-accent/80 hover:border-accent hover:text-accent-foreground text-foreground font-semibold text-base sm:text-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer w-full sm:w-auto"
              >
                كيف يعمل
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
