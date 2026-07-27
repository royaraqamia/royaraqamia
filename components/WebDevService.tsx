'use client';

import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Code, Rocket, ShieldCheck, DeviceMobile, Monitor, Globe } from '@phosphor-icons/react';
import { WHATSAPP_PHONE } from '../lib/constants';
import { SectionBackground } from './SectionBackground';

// --- Framer Motion Variants ---
const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const fadeUpVariant = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80, damping: 20 } },
} as const;

const scaleInVariant = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 100, damping: 20 } },
} as const;

export function WebDevService() {
  const benefits = [
    { icon: Code, text: 'أفضل ممارسات البرمجة بكود نظيف وقابل للصِّيانة' },
    { icon: Rocket, text: 'نشر سريع مع أداء مُحسَّن' },
    { icon: ShieldCheck, text: 'تطوير آمن مع معايير أمان حديثة' },
    { icon: DeviceMobile, text: 'تصميم متجاوب لجميع الأجهزة وأحجام الشَّاشات' },
  ];

  const features = [
    { title: 'Frontend', description: 'Next.js مع واجهات UX/UI حديثة' },
    { title: 'Backend', description: 'Supabase' },
    { title: 'Mobile Apps', description: 'Flutter لنظامي Android و iOS' },
  ];

  return (
    <section id="web-dev-service" className="relative py-24 overflow-hidden bg-background">
      {/* Background with optimized z-index and subtle overlay */}
      <div className="absolute inset-0 z-0 opacity-80 pointer-events-none">
        <SectionBackground
          blobs={[
            {
              top: '0',
              left: '0',
              width: '500px',
              height: '500px',
              background: 'rgba(139, 92, 246, 0.08)',
              filter: 'blur(60px)',
              transform: 'translate(-20%, -30%)',
              animation: 'pulse-slow 8s ease-in-out infinite',
            },
            {
              bottom: '0',
              right: '0',
              width: '500px',
              height: '500px',
              background: 'rgba(124, 58, 237, 0.08)',
              filter: 'blur(60px)',
              transform: 'translate(20%, 20%)',
              animation: 'pulse-slow 8s ease-in-out infinite',
              animationDelay: '2s',
            },
          ]}
        />
        {/* Adds a premium noise/grain texture overlay (Optional but highly recommended for high-end feel) */}
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay"></div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Section Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          variants={fadeUpVariant}
          className="text-center max-w-3xl mx-auto mb-20"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl mb-6 font-extrabold tracking-tight">
            <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-400 via-violet-500 to-indigo-400">
              البناء
            </span>
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-foreground/70 leading-relaxed font-medium">
            خدمات هندسيَّة وإداريَّة متكاملة للمواقع والتَّطبيقات من الفكرة حتَّى الإطلاق.
          </p>
        </motion.div>

        {/* Grid Layout */}
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* Left: Benefits & Features (Spans 7 cols) */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
            className="lg:col-span-7 space-y-10"
          >
            {/* Benefits List */}
            <div className="flex flex-col gap-4">
              {benefits.map((benefit, idx) => (
                <motion.div
                  key={idx}
                  variants={fadeUpVariant}
                  className="group flex items-start gap-5 p-5 rounded-2xl bg-white/5 dark:bg-white/2 border border-white/10 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all duration-500 ease-out backdrop-blur-sm shadow-sm"
                >
                  <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-600 to-violet-700 flex items-center justify-center shrink-0 shadow-lg shadow-purple-600/20 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                    <benefit.icon
                      className="w-6 h-6 text-white"
                      aria-hidden="true"
                      weight="duotone"
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-center h-12">
                    <span className="text-base md:text-lg font-medium text-foreground/80 group-hover:text-foreground transition-colors text-start leading-snug">
                      {benefit.text}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  variants={fadeUpVariant}
                  className="relative p-6 rounded-2xl bg-purple-600/3 border border-purple-600/10 hover:border-purple-500/40 transition-all duration-300 group overflow-hidden"
                >
                  {/* Subtle hover glow effect */}
                  <div className="absolute inset-0 bg-linear-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <h3 className="relative text-xl font-bold text-purple-400 mb-2 group-hover:text-purple-300 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="relative text-sm text-foreground/70 leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right: Pricing & Process (Spans 5 cols) */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
            className="lg:col-span-5 space-y-6 lg:sticky lg:top-32"
          >
            {/* Pricing Card 1 */}
            <motion.div
              variants={scaleInVariant}
              className="group relative p-7 rounded-3xl bg-background border border-white/10 hover:border-purple-500/50 shadow-xl shadow-black/5 hover:shadow-purple-600/10 transition-all duration-500 overflow-hidden z-10"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 rounded-full blur-3xl -z-10 group-hover:bg-purple-600/20 transition-colors duration-500"></div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <Monitor className="w-7 h-7 text-purple-400" weight="duotone" />
                  </div>
                  <div className="text-start">
                    <h3 className="text-xl font-bold text-foreground">موقع Web</h3>
                    <p className="text-sm text-foreground/50 mt-1">بدون Backend</p>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-4xl font-extrabold text-purple-400 tracking-tight">$100</div>
                  <div className="text-xs font-medium text-foreground/50 uppercase tracking-wider mt-1">
                    اشتراك شهري
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Pricing Card 2 (Premium Highlight) */}
            <motion.div
              variants={scaleInVariant}
              className="group relative p-7 rounded-3xl bg-linear-to-b from-purple-900/20 to-background border border-purple-500/30 hover:border-purple-400/60 shadow-2xl shadow-purple-900/20 transition-all duration-500 overflow-hidden z-10"
            >
              {/* Animated subtle gradient line at the top */}
              <div className="absolute top-0 inset-x-0 h-0.5 bg-linear-to-r from-transparent via-purple-400 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>

              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <Globe className="w-7 h-7 text-purple-400" weight="duotone" />
                  </div>
                  <div className="text-start">
                    <h3 className="text-xl font-bold text-foreground">تطبيق Web أو Mobile</h3>
                    <p className="text-sm text-purple-300/70 mt-1">مع Backend</p>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-4xl font-extrabold text-purple-400 tracking-tight">$200</div>
                  <div className="text-xs font-medium text-foreground/50 uppercase tracking-wider mt-1">
                    اشتراك شهري
                  </div>
                </div>
              </div>
            </motion.div>

            {/* CTA Button */}
            <motion.div variants={fadeUpVariant} className="pt-4">
              <a
                href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent('السَّلام عليكم، أنا مهتم بخدمة بناء المواقع والتَّطبيقات.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <Button className="relative w-full h-16 text-lg font-bold rounded-2xl bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_40px_-10px_rgba(147,51,234,0.5)] hover:shadow-[0_0_60px_-15px_rgba(168,85,247,0.7)] transition-all duration-300 overflow-hidden">
                  {/* Button hover shine effect */}
                  <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-linear-to-r from-transparent via-white/20 to-transparent w-1/2 -skew-x-12 z-0"></div>
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    ابدأ البناء الآن
                  </span>
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
