'use client';

import { motion } from 'motion/react';
import { ArrowLeft, Link } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useSession } from '@/components/shared/session-provider';
import { cn } from '@/lib/utils';

const floatingIcons = [
  { Icon: Link, delay: 0, x: '-30%', y: '-20%', size: 32 },
  { Icon: Link, delay: 0.5, x: '35%', y: '-30%', size: 28 },
  { Icon: Link, delay: 1, x: '-25%', y: '25%', size: 24 },
  { Icon: Link, delay: 1.5, x: '30%', y: '20%', size: 36 },
];

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
      router.push('/linksnap/app');
    } else {
      router.push('/auth/login?redirect=/linksnap');
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <GlowOrb className="w-96 h-96 bg-primary/20 top-1/4 -left-48 animate-pulse-slow" />
      <GlowOrb
        className="w-80 h-80 bg-accent-teal/10 bottom-1/4 -right-40 animate-pulse-slow"
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
              اختصار الروابط والتحليلات
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-[-0.04em] mb-6"
            >
              <span className="gradient-text">اختصِر.</span>
              <br />
              <span>شارك.</span>
              <br />
              <span className="gradient-text">تتبَّع.</span>
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto lg:mx-0 mb-10 font-normal"
            >
              حوِّل روابطك الطويلة إلى روابط قصيرة قوية قابلة للتتبُّع. راقب كل نقرة واحصل على رؤى
              حول جمهورك.
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            >
              <Button size="xl" onClick={handleCTA} className="cta-glow text-base px-10">
                {user ? 'لوحة التحكم' : 'ابدأ مجاناً'}
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
                className="glass-card rounded-2xl p-8 transform-gpu"
                style={{ transform: 'rotateY(-8deg) rotateX(4deg)' }}
              >
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <div className="mr-auto text-xs text-muted-foreground">linksnap.app</div>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      url: 'https://example.com/very-long-link/123',
                      short: 'linksnap.app/abc',
                      clicks: '1.2k',
                    },
                    {
                      url: 'https://blog.example.com/article',
                      short: 'linksnap.app/xyz',
                      clicks: '856',
                    },
                    {
                      url: 'https://store.example.com/product',
                      short: 'linksnap.app/def',
                      clicks: '2.4k',
                    },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
                      className="glass rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground truncate max-w-50">
                          {item.url}
                        </span>
                        <ArrowLeft size={14} className="text-primary shrink-0" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-primary">{item.short}</span>
                        <span className="text-xs text-muted-foreground">{item.clicks} نقرة</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.4, duration: 0.5 }}
                  className="mt-6 pt-6 border-t border-border/50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Link size={16} className="text-primary" />
                    </div>
                    <span className="text-sm font-medium">إجمالي الروابط</span>
                  </div>
                  <span className="text-2xl font-bold gradient-text">12</span>
                </motion.div>
              </motion.div>

              {floatingIcons.map(({ Icon, delay, x, y, size }, i) => (
                <motion.div
                  key={i}
                  className="absolute -z-10"
                  style={{ left: x, top: y }}
                  animate={{ y: [0, -10 + i * 3, 0] }}
                  transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay }}
                >
                  <div className="glass-card rounded-2xl p-4">
                    <Icon size={size} className="text-primary/60" />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
