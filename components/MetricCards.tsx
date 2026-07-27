'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, animate } from 'motion/react';
import { Clock, Trophy, TrendUp } from '@phosphor-icons/react';

// --- Elite Feature: Animated Counter ---
function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 2.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setDisplayValue(Math.round(latest));
      },
    });
    return controls.stop;
  }, [inView, value]);

  return (
    <span ref={ref} className="font-tabular-nums">
      {displayValue}
      {suffix}
    </span>
  );
}

export function MetricCards() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 50, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 60,
        damping: 20,
      },
    },
  } as const;

  // Separated numeric value and suffix for the animation logic
  const metrics = [
    {
      icon: Trophy,
      numericValue: 7,
      suffix: '+',
      label: 'سنوات من الخبرة',
      description: 'في السُّوق الرَّقمي بخبرة متراكمة',
      colorKey: 'purple' as const,
    },
    {
      icon: Clock,
      numericValue: 400,
      suffix: '+',
      label: 'ساعة إجماليَّة',
      description: 'في التَّدريب وتقديم الاستشارات',
      colorKey: 'indigo' as const,
    },
    {
      icon: TrendUp,
      numericValue: 100,
      suffix: '+',
      label: 'مشروع رقمي',
      description: 'تم إنجازها بين مواقع وتطبيقات',
      colorKey: 'violet' as const,
    },
  ];

  // Upgraded color configs with text gradients and ambient shadows
  const colorConfigs = {
    purple: {
      bgHover: 'group-hover/card:bg-purple-500/[0.03]',
      borderHover: 'group-hover/card:border-purple-500/30',
      iconGlow: 'group-hover/card:text-purple-400 group-hover/card:bg-purple-500/10 text-white',
      textGradient: 'from-purple-400 to-purple-600',
      shadow: 'group-hover/card:shadow-[0_0_40px_-15px_rgba(168,85,247,0.3)]',
    },
    indigo: {
      bgHover: 'group-hover/card:bg-indigo-500/[0.03]',
      borderHover: 'group-hover/card:border-indigo-500/30',
      iconGlow: 'group-hover/card:text-indigo-400 group-hover/card:bg-indigo-500/10 text-white',
      textGradient: 'from-indigo-400 to-indigo-600',
      shadow: 'group-hover/card:shadow-[0_0_40px_-15px_rgba(99,102,241,0.3)]',
    },
    violet: {
      bgHover: 'group-hover/card:bg-violet-500/[0.03]',
      borderHover: 'group-hover/card:border-violet-500/30',
      iconGlow: 'group-hover/card:text-violet-400 group-hover/card:bg-violet-500/10 text-white',
      textGradient: 'from-violet-400 to-violet-600',
      shadow: 'group-hover/card:shadow-[0_0_40px_-15px_rgba(139,92,246,0.3)]',
    },
  };

  return (
    <section className="relative py-24 lg:py-32 overflow-hidden bg-[#050810]">
      {/* Background - Ultra-minimal ambient center glow */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(900px,100vw)] h-[min(900px,100vw)] bg-white opacity-[0.01] blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid md:grid-cols-3 gap-8 lg:gap-10"
        >
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            const colors = colorConfigs[metric.colorKey];

            return (
              <motion.div
                key={index}
                variants={itemVariants}
                className={`group/card relative rounded-[2.5rem] p-8 lg:p-12 transition-all duration-700 overflow-hidden bg-white/2 border border-white/5 backdrop-blur-md z-10 hover:-translate-y-2 ${colors.borderHover} ${colors.shadow}`}
              >
                {/* 
                  Premium Ambient Hover Layer 
                  Provides a subtle tinted background on hover without being overwhelming
                */}
                <div
                  className={`absolute inset-0 transition-colors duration-700 -z-10 ${colors.bgHover}`}
                />

                <div className="flex flex-col h-full relative z-10">
                  {/* Floating Minimalist Icon */}
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: index * 0.5,
                    }}
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-12 transition-all duration-500 bg-white/5 border border-white/10 group-hover/card:scale-110 group-hover/card:-rotate-6 relative overflow-hidden ${colors.iconGlow}`}
                  >
                    <Icon weight="duotone" className="w-8 h-8 drop-shadow-lg relative z-10" />
                  </motion.div>

                  {/* Editorial Typography & Data */}
                  <div className="mt-auto text-start">
                    {/* The Number Container with Hover Gradient Text */}
                    <div className="relative text-6xl lg:text-7xl xl:text-8xl font-extrabold tracking-tighter mb-6 transition-transform duration-700 ease-out group-hover/card:translate-x-2 rtl:group-hover/card:-translate-x-2">
                      {/* Base White Number (Fades out slightly on hover) */}
                      <span className="absolute inset-0 text-white transition-opacity duration-500 group-hover/card:opacity-0">
                        <AnimatedCounter value={metric.numericValue} suffix={metric.suffix} />
                      </span>

                      {/* Colored Gradient Number (Reveals on hover) */}
                      <span
                        className={`bg-clip-text text-transparent bg-linear-to-r ${colors.textGradient} opacity-0 transition-opacity duration-500 group-hover/card:opacity-100`}
                      >
                        <AnimatedCounter value={metric.numericValue} suffix={metric.suffix} />
                      </span>
                    </div>

                    <div className="w-12 h-1 bg-white/10 rounded-full mb-6 transition-all duration-500 group-hover/card:w-24 group-hover/card:bg-white/30" />

                    <div className="text-xl lg:text-2xl font-bold text-white mb-3">
                      {metric.label}
                    </div>

                    <p className="text-sm md:text-base text-white/50 leading-relaxed font-medium">
                      {metric.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
