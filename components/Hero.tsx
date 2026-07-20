'use client';

import { m } from 'motion/react';
import { ArrowLeft } from '@phosphor-icons/react';
import { HeroVisual } from './HeroVisual';
import { getWhatsAppUrl } from '../lib/constants';

export function Hero() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
    },
  };

  // Floating particles data - deterministic positions to avoid hydration mismatch
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    size: ((i * 7 + 3) % 3) + 1,
    x: (i * 13 + 7) % 100,
    y: (i * 17 + 11) % 100,
    duration: ((i * 23 + 5) % 20) + 15,
    delay: (i * 11 + 3) % 5,
  }));

  return (
    <>
      <section
        id="home"
        className="relative min-h-[90vh] flex items-center overflow-hidden pt-24 md:pt-32 pb-12 lg:py-0"
      >
        {/* Background with Gradient */}
        <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-purple-950/80 to-slate-900 z-0 overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-primary-600/5 to-transparent" />
          {/* Reduced blur radius and opacity for cleaner look */}
          <div className="absolute top-0 right-1/4 w-[min(500px,80vw)] h-[min(500px,80vw)] bg-primary-600 opacity-[0.03] blur-[120px] rounded-full" />
          <div className="absolute bottom-0 left-1/4 w-[min(500px,80vw)] h-[min(500px,80vw)] bg-primary-400 opacity-[0.03] blur-[120px] rounded-full" />

          {/* Floating Particles - Subtler */}
          {particles.map((particle) => (
            <m.div
              key={particle.id}
              className="absolute rounded-full bg-white"
              style={{
                width: particle.size,
                height: particle.size,
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                opacity: 0.1, // Fixed low opacity base
              }}
              animate={{
                y: [0, -40, 0],
                opacity: [0.1, 0.3, 0.1],
              }}
              transition={{
                duration: particle.duration,
                delay: particle.delay,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          ))}
        </div>

        <div className="max-w-7xl mx-auto container-padding relative z-10 w-full">
          <m.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center"
            transition={{ staggerChildren: 0.1, delayChildren: 0.2 }}
          >
            {/* Left side - Content (RTL: will appear on right naturally in RTL layout) */}
            <div className="text-center lg:text-right space-y-4 order-1">
              {/* Badge - Static Glow for performance */}
              <m.div variants={itemVariants} className="flex justify-center lg:justify-start mb-2!">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 backdrop-blur-md text-white border border-slate-700/50 relative overflow-hidden group hover:border-primary-500/30 transition-colors duration-300">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                  </span>
                  <span className="text-sm font-medium text-slate-200">ابدأ رحلتك الرَّقميَّة</span>

                  {/* Subtle sheen */}
                  <div className="absolute inset-0 w-full h-full bg-linear-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shine-slide_1.5s_infinite]" />
                </div>
              </m.div>

              {/* Main Headline */}
              <m.div variants={itemVariants} className="space-y-1 mt-1!">
                <h1 className="text-[1.75rem] sm:text-6xl lg:text-7xl font-normal tracking-tight font-heading leading-tight">
                  <span className="block text-teal-300 mb-0.5 lg:mb-1">شريكك الاستراتيجي</span>
                  <span className="text-white drop-shadow-xl whitespace-normal lg:whitespace-nowrap break-words">
                    للتحوُّل الرَّقمي ومضاعفة نجاحك
                  </span>
                </h1>
              </m.div>

              {/* Description */}
              <m.p
                variants={itemVariants}
                className="text-sm sm:text-base lg:text-lg text-slate-300 max-w-2xl mx-auto lg:mx-0 leading-relaxed"
              >
                نبني مواقع إلكترونيَّة وتطبيقات بكود نظيف، قابل للصِّيانة والتَّوسُّع؛
                <br />
                كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع
                والتَّطبيقات.
              </m.p>

              {/* CTA Button - Optimized */}
              <m.div
                variants={itemVariants}
                className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-2 items-center w-full sm:w-auto"
              >
                <a
                  href={getWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative h-14 w-auto min-w-[200px] max-w-full flex items-center justify-center px-8 rounded-full gradient-primary text-white text-lg font-bold transition-transform active:scale-95 cta-shine overflow-hidden cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {/* Hover Glow via Opacity (Performant) - Adjusted for gradient */}
                  <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Shadow via pseudo-element */}
                  <div className="absolute -inset-1 rounded-full bg-primary-600/40 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <span className="relative z-10 flex items-center gap-3">
                    تواصل معنا الآن
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  </span>

                  {/* Shine element */}
                  <span className="shine-element absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent skew-x-12" />
                </a>
              </m.div>
            </div>

            {/* Right side - Visual Element */}
            <m.div
              variants={itemVariants}
              className="relative order-2 w-full flex justify-center lg:justify-end mt-8 lg:mt-0"
            >
              <HeroVisual />
            </m.div>
          </m.div>
        </div>
      </section>
    </>
  );
}
