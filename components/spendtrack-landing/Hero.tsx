'use client';

import { motion } from 'motion/react';
import { ArrowLeft, Wallet } from '@phosphor-icons/react';
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

const transactions = [
  { desc: 'بقالة', amount: '-$84.50', cat: 'طعام', color: 'text-accent-orange' },
  { desc: 'راتب', amount: '+$3,200', cat: 'دخل', color: 'text-success' },
  { desc: 'نتفلكس', amount: '-$15.99', cat: 'ترفيه', color: 'text-primary' },
  { desc: 'وقود', amount: '-$42.00', cat: 'مواصلات', color: 'text-accent-teal' },
];

export function Hero() {
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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <GlowOrb className="w-96 h-96 bg-primary/20 top-1/4 -right-48 animate-pulse-slow" />
      <GlowOrb
        className="w-80 h-80 bg-accent-teal/10 bottom-1/4 -left-40 animate-pulse-slow"
        style={{ animationDelay: '2s' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto container-padding pt-32 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center lg:text-right"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8"
            >
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse-slow" />
              تتبُّع المصروفات والتحليلات
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-[-0.04em] mb-6"
            >
              <span className="gradient-text">تتبَّع.</span>
              <br />
              <span>حلِّل.</span>
              <br />
              <span className="gradient-text">وفِّر.</span>
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto lg:mx-0 mb-10 font-normal"
            >
              سجِّل المصروفات حسب التصنيف، وصوِّر أنماط الإنفاق، وتحكَّم في أموالك من خلال تحليلات
              شهرية واضحة.
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            >
              <Button size="xl" onClick={handleCTA} className="cta-glow text-base px-10">
                {user ? 'اذهب إلى لوحة التحكم' : 'ابدأ التتبُّع مجاناً'}
                <ArrowLeft size={20} weight="bold" className="arrow-bounce" />
              </Button>
              <Button
                size="xl"
                variant="outline"
                onClick={() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-base"
              >
                اعرف المزيد
              </Button>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="relative hidden lg:block"
          >
            <div className="relative perspective-3d">
              <motion.div
                animate={{ y: [0, -16, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="glass-card rounded-2xl p-6 transform-gpu"
                style={{ transform: 'rotateY(8deg) rotateX(4deg)' }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <div className="mr-auto text-xs text-muted-foreground">spendtrack.app</div>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm font-medium">آخر النشاطات</span>
                  <span className="text-2xl font-bold gradient-text">$3,057</span>
                </div>

                <div className="space-y-2">
                  {transactions.map((tx, i) => (
                    <motion.div
                      key={tx.desc}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + i * 0.12, duration: 0.4 }}
                      className="glass rounded-xl p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Wallet size={16} className="text-primary" />
                        </div>
                        <div>
                          <span className="text-sm font-medium block">{tx.desc}</span>
                          <span className="text-xs text-muted-foreground">{tx.cat}</span>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ${tx.color}`}>{tx.amount}</span>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.4, duration: 0.5 }}
                  className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <span className="text-sm text-muted-foreground">الميزانية الشهرية</span>
                  </div>
                  <span className="text-sm font-bold text-accent-teal">مُستهلَك 68%</span>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
