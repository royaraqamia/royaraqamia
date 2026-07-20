import { motion, useReducedMotion, useSpring, useMotionValue } from 'motion/react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface StatsCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
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
  const [display, setDisplay] = useState('0' + suffix);

  useEffect(() => {
    if (!shouldAnimate) return;
    const unsub = springValue.on('change', (v) => {
      const rounded = target % 1 === 0 ? Math.round(v) : v.toFixed(1);
      setDisplay(`${rounded}${suffix}`);
    });
    motionValue.set(target);
    return unsub;
  }, [target, springValue, motionValue, suffix, shouldAnimate]);

  if (!shouldAnimate)
    return (
      <p className="text-2xl font-bold text-foreground" aria-live="polite">
        {raw}
      </p>
    );

  return (
    <p className="text-2xl font-bold text-foreground" aria-live="polite">
      {display}
    </p>
  );
}

export function StatsCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  index = 0,
}: StatsCardProps) {
  const prefersReduce = useReducedMotion();
  const reduce = prefersReduce === true;
  return (
    <motion.div
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
    >
      <Card className="p-5 flex items-center gap-4 transition-shadow duration-200 hover:-translate-y-[1px] hover:shadow-[var(--shadow-card-hover)] group">
        <div
          className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} group-hover:scale-105 transition-transform duration-200`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <AnimatedValue value={value} reduce={reduce} />
        </div>
      </Card>
    </motion.div>
  );
}
