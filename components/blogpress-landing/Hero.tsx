'use client';

import { motion } from 'motion/react';
import { ArrowLeft, FileText } from '@phosphor-icons/react';
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
    <section className="relative min-h-dvh flex items-center justify-center overflow-hidden">
      <GlowOrb className="w-96 h-96 bg-primary/20 top-1/4 -right-48 animate-pulse-slow" />
      <GlowOrb
        className="w-80 h-80 bg-accent-indigo/10 bottom-1/4 -left-40 animate-pulse-slow"
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
              منصة التدوين بالماركداون
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-[-0.04em] mb-6"
            >
              <span className="gradient-text">اكتب.</span>
              <br />
              <span>انشر.</span>
              <br />
              <span className="gradient-text">تنمَّ.</span>
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto lg:mx-0 mb-10 font-normal"
            >
              محرر ماركداون متكامل مع إدارة المسوَّدات وتحسين محركات البحث ونشر احترافي — كل ما
              تحتاجه في مكان واحد.
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            >
              <Button size="xl" onClick={handleCTA} className="cta-glow text-base px-10">
                {user ? 'لوحة التحكم' : 'ابدأ الكتابة مجاناً'}
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
                  <div className="me-auto text-xs text-muted-foreground">blogpress.app</div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="glass rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-primary">editor.md</span>
                        <span className="text-xs text-muted-foreground me-auto">مسوَّدة</span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-3 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-5/6" />
                        <div className="h-3 bg-muted rounded w-2/3" />
                        <div className="h-3 bg-muted rounded w-4/5" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="glass rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText size={14} className="text-primary" />
                        <span className="text-xs font-medium">معاينة</span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 bg-primary/20 rounded w-1/2" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-3/4" />
                      </div>
                    </div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.4, duration: 0.5 }}
                      className="glass rounded-xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-xs text-muted-foreground">تحسين محركات البحث</span>
                      </div>
                      <span className="text-sm font-bold text-primary">92/100</span>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {[FileText, FileText, FileText].map((Icon, i) => (
                <motion.div
                  key={i}
                  className="absolute -z-10"
                  style={{ left: `${-20 + i * 45}%`, top: `${-15 + i * 20}%` }}
                  animate={{ y: [0, -8 + i * 4, 0] }}
                  transition={{
                    duration: 4 + i,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.5,
                  }}
                >
                  <div className="glass-card rounded-2xl p-3">
                    <Icon size={24} className="text-primary/60" />
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
