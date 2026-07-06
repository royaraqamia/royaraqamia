'use client';

import { motion } from 'framer-motion';
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
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
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
      gradient: 'linear-gradient(135deg, #14B8A6 0%, #0891B2 100%)',
      glowColor: 'rgba(20, 184, 166, 0.3)',
    },
    purple: {
      gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
      glowColor: 'rgba(139, 92, 246, 0.3)',
    },
    orange: {
      gradient: 'linear-gradient(135deg, #F97316 0%, #D97706 100%)',
      glowColor: 'rgba(249, 115, 22, 0.3)',
    },
  };

  return (
    <section className="relative py-16 lg:py-24 overflow-hidden">
      {/* Background with subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-600 opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto container-padding relative z-10">
        <motion.div
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
              <motion.div
                key={index}
                variants={itemVariants}
                className="group relative glass-card rounded-2xl p-6 lg:p-8 glass-hover transition-all duration-500 border border-transparent hover:border-white/10 overflow-hidden"
              >
                {/* Colored top accent */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: colors.gradient }}
                />

                {/* Glass shine effect on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden rounded-2xl">
                  <div
                    className="absolute -inset-full top-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent transform -skew-x-12 group-hover:animate-shine"
                    style={{ animationDuration: '1.5s' }}
                  />
                </div>

                {/* Icon */}
                <div
                  className="w-14 h-14 lg:w-16 lg:h-16 rounded-xl flex items-center justify-center mb-4 lg:mb-6 shadow-lg group-hover:shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500"
                  style={{ background: colors.gradient }}
                >
                  <Icon className="w-7 h-7 lg:w-8 lg:h-8 text-white drop-shadow-md" />
                </div>

                {/* Value */}
                <div
                  className="text-4xl lg:text-5xl font-bold mb-2 lg:mb-3"
                  style={{
                    fontFamily: "'Aref Ruqaa Numbers', 'Aref Ruqaa', serif",
                    background: colors.gradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {metric.value}
                </div>

                {/* Label */}
                <h3
                  className="text-lg lg:text-xl font-bold text-white mb-2 transition-all duration-300"
                  style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                >
                  {metric.label}
                </h3>

                {/* Description */}
                <p className="text-sm lg:text-base text-foreground/70 leading-relaxed">
                  {metric.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* CSS for shine animation */}
      <style>{`
        @keyframes shine {
          0% { transform: translateX(-100%) skewX(-12deg); }
          100% { transform: translateX(200%) skewX(-12deg); }
        }
        .group:hover .group-hover\\:animate-shine {
          animation: shine 1.5s ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .group-hover\\:animate-shine {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
