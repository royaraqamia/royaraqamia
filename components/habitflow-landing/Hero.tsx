'use client';

import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle, Fire } from '@phosphor-icons/react';
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

const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const habitData = [
  { name: 'تأمُّل', done: [true, true, true, true, false, true, true], color: 'bg-primary' },
  { name: 'تمارين', done: [true, false, true, true, true, false, true], color: 'bg-accent-indigo' },
  {
    name: 'قراءة',
    done: [true, true, false, true, true, true, false],
    color: 'bg-accent-purple',
  },
];

export function Hero() {
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
    <section className="relative min-h-dvh flex items-center justify-center overflow-hidden">
      <GlowOrb className="w-96 h-96 bg-primary/20 top-1/4 -left-48 animate-pulse-slow" />
      <GlowOrb
        className="w-80 h-80 bg-accent-indigo/10 bottom-1/4 -right-40 animate-pulse-slow"
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
              تتبُّع العادات والسلاسل
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-[-0.04em] mb-6"
            >
              <span className="gradient-text">تتبَّع.</span>
              <br />
              <span>واظب.</span>
              <br />
              <span className="gradient-text">ازدَهِر.</span>
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto lg:mx-0 mb-10 font-normal"
            >
              ابنِ العادات اليومية وحافظ عليها مع تتبُّع السلاسل والتقويمات البصرية والتحفيز الذي
              يدفعك للاستمرار.
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
                style={{ transform: 'rotateY(-8deg) rotateX(4deg)' }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <div className="ms-auto text-xs text-muted-foreground">habitflow.app</div>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm font-medium">هذا الأسبوع</span>
                  <span className="text-2xl font-bold gradient-text inline-flex items-center gap-1">
                    <Fire size={24} weight="fill" className="text-primary" /> 12
                  </span>
                </div>

                <div className="flex items-center justify-between mb-5 px-1">
                  {weekDays.map((day, i) => (
                    <span key={i} className="text-xs text-muted-foreground w-8 text-center">
                      {day}
                    </span>
                  ))}
                </div>

                <div className="space-y-3">
                  {habitData.map((habit, i) => (
                    <motion.div
                      key={habit.name}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
                      className="glass rounded-xl p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{habit.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {habit.done.filter(Boolean).length}/{habit.done.length}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {habit.done.map((done, j) => (
                          <div
                            key={j}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
                              done ? `${habit.color} text-white` : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {done ? <CheckCircle size={16} weight="fill" /> : <span>·</span>}
                          </div>
                        ))}
                      </div>
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
                    <CheckCircle size={16} className="text-primary" />
                    <span className="text-sm text-muted-foreground">أفضل سلسلة</span>
                  </div>
                  <span className="text-lg font-bold text-accent-indigo">21 days</span>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
