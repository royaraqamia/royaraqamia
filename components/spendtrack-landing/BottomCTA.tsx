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
    <section className="relative overflow-hidden border-t border-border/50">
      <div className="absolute inset-0 bg-linear-to-br from-primary/20 via-primary/10 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto container-padding py-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8"
          >
            <Sparkle size={16} weight="fill" />
            ابدأ التتبُّع اليوم
          </motion.div>

          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            هل أنت مستعد للتحكُّم <span className="gradient-text">بأموالك؟</span>
          </h2>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            انضم إلى آلاف المستخدمين الذين يستخدمون SpendTrack لتسجيل المصروفات وتحليل الأنماط
            واتخاذ قرارات مالية أذكى كل يوم.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button size="xl" onClick={handleCTA} className="cta-glow text-lg px-12 h-16">
              {user ? 'اذهب إلى لوحة التحكم' : 'أنشئ حسابك'}
              <ArrowLeft size={22} weight="bold" className="arrow-bounce" />
            </Button>
            <Button
              size="xl"
              variant="outline"
              onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-lg h-16 px-10"
            >
              كيف يعمل
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
