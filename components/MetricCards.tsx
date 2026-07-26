'use client';

import { m } from 'motion/react';
import { Clock, Trophy, TrendUp } from '@phosphor-icons/react';

export function MetricCards() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.25, 1, 0.5, 1] as const, // Premium cubic-bezier easing
      },
    },
  };

  const metrics = [
    {
      icon: Trophy,
      value: '7+',
      label: 'سنوات من الخبرة',
      description: 'في السُّوق الرَّقمي',
      colorKey: 'purple' as const,
    },
    {
      icon: Clock,
      value: '400+',
      label: 'ساعة إجماليَّة',
      description: 'في التَّدريب والاستشارات',
      colorKey: 'teal' as const,
    },
    {
      icon: TrendUp,
      value: '100+',
      label: 'مشروع رقمي',
      description: 'ما بين مواقع وتطبيقات',
      colorKey: 'orange' as const,
    },
  ];

  const colorConfigs = {
    teal: {
      glow: 'group-hover/card:bg-teal-500/10',
      borderGlow: 'group-hover/card:border-teal-500/30',
      iconGlow: 'group-hover/card:text-teal-400 group-hover/card:bg-teal-500/10',
    },
    purple: {
      glow: 'group-hover/card:bg-purple-500/10',
      borderGlow: 'group-hover/card:border-purple-500/30',
      iconGlow: 'group-hover/card:text-purple-400 group-hover/card:bg-purple-500/10',
    },
    orange: {
      glow: 'group-hover/card:bg-orange-500/10',
      borderGlow: 'group-hover/card:border-orange-500/30',
      iconGlow: 'group-hover/card:text-orange-400 group-hover/card:bg-orange-500/10',
    },
  };

  return (
    <section className="relative py-20 lg:py-32 overflow-hidden">
      {/* Background - Kept extremely dark and minimal */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,100vw)] h-[min(800px,100vw)] bg-white opacity-[0.015] blur-[120px] rounded-full pointer-events-none" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        <m.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid md:grid-cols-3 gap-6 lg:gap-8"
        >
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            const colors = colorConfigs[metric.colorKey];

            return (
              <m.div
                key={index}
                variants={itemVariants}
                className={`group/card relative rounded-4xl p-8 lg:p-10 transition-all duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden bg-white/2 border border-white/5 backdrop-blur-sm ${colors.borderGlow}`}
              >
                {/* Ambient Hover Glow Effect (Replaces the cheesy shine) */}
                <div
                  className={`absolute inset-0 transition-colors duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] -z-10 ${colors.glow}`}
                />

                <div className="flex flex-col h-full relative z-10">
                  {/* Premium Minimalist Icon */}
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-10 transition-all duration-600 ease-[cubic-bezier(0.25,1,0.5,1)] bg-white/5 text-white/60 border border-white/10 group-hover/card:scale-110 group-hover/card:-rotate-3 ${colors.iconGlow}`}
                  >
                    <Icon weight="light" className="w-7 h-7 drop-shadow-sm" />
                  </div>

                  {/* Massive Editorial Typography */}
                  <div className="mt-auto">
                    <div className="text-5xl lg:text-7xl font-bold tracking-tighter text-white mb-4 transition-transform duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:translate-x-1 rtl:group-hover/card:-translate-x-1">
                      {metric.value}
                    </div>

                    {/* Labels aligned for RTL */}
                    <h2 className="text-xl lg:text-2xl font-bold text-white/95 mb-2">
                      {metric.label}
                    </h2>

                    <p className="text-base text-white/50 leading-relaxed font-medium max-w-[90%]">
                      {metric.description}
                    </p>
                  </div>
                </div>
              </m.div>
            );
          })}
        </m.div>
      </div>
    </section>
  );
}
