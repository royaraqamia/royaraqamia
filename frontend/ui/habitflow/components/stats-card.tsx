import { m, useReducedMotion, useSpring, useMotionValue } from 'motion/react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/frontend/ui/primitives/card';

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  index?: number;
}

function AnimatedValue({ value: raw, reduce }: { value: string; reduce: boolean }) {
  const match = raw.match(/^(\d+(?:\.\d+)?)(.*)$/);
  const shouldAnimate = !!match && !reduce;
  const target = match ? parseFloat(match[0]) : 0;
  const suffix = match ? match[2] : '';
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { stiffness: 60, damping: 15 });
  const [display, setDisplay] = useState(shouldAnimate ? '0' + suffix : raw);

  useEffect(() => {
    if (!shouldAnimate) return;
    const unsub = springValue.on('change', (v) => {
      const rounded = target % 1 === 0 ? Math.round(v) : v.toFixed(1);
      setDisplay(`${rounded}${suffix}`);
    });
    motionValue.set(target);
    return unsub;
  }, [target, springValue, motionValue, suffix, shouldAnimate]);

  return (
    <p
      className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl xl:text-4xl font-display tabular-nums min-w-0 truncate"
      aria-live="polite"
    >
      {display}
    </p>
  );
}

export function StatsCard({ icon: Icon, label, value, index = 0 }: StatsCardProps) {
  const prefersReduce = useReducedMotion();
  const reduce = prefersReduce === true;

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? undefined
          : {
              type: 'spring',
              stiffness: 300,
              damping: 25,
              delay: index * 0.06,
            }
      }
      className="h-full"
    >
      <Card className="group relative h-full overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-4.5 sm:p-5 lg:p-6 backdrop-blur-xl transition-all duration-300 ease-out hover:border-border hover:bg-card/90 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99] focus-within:ring-2 focus-within:ring-primary/20">
        {/* Ambient Subtle Hover Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-linear-to-br from-primary/10 via-transparent to-transparent"
        />

        <div className="relative z-10 flex items-center gap-3.5 sm:gap-4.5 min-w-0">
          {/* Icon Badge with Ring & Micro-interaction */}
          <div
            className={`relative flex shrink-0 items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-xs transition-all duration-300 ease-out ${
              !reduce
                ? 'group-hover:scale-110 group-hover:rotate-3 group-hover:bg-primary/15 group-hover:shadow-md group-hover:shadow-primary/10'
                : ''
            }`}
          >
            <Icon className="w-5 h-5 sm:w-5.5 sm:h-5.5 transition-transform duration-300 group-hover:scale-105" />
          </div>

          {/* Metadata & Numeric Value */}
          <div className="flex flex-col justify-center min-w-0 flex-1 space-y-0.5">
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 transition-colors duration-200 group-hover:text-foreground/80 select-none truncate">
              {label}
            </p>
            <AnimatedValue value={value} reduce={reduce} />
          </div>
        </div>
      </Card>
    </m.div>
  );
}
