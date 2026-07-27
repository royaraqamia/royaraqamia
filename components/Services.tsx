'use client';

import { motion } from 'motion/react';
import { ChatCircle, Code, Lightbulb } from '@phosphor-icons/react';
import { ServiceCard } from './services/ServiceCard';
import type { ColorKey } from './services/colorConfigs';

// Interfaces remain identical for seamless drop-in
interface ServiceItem {
  icon: typeof ChatCircle;
  title: string;
  description: string;
  features: string[];
  pricing: {
    cta: string;
  };
  colorKey: ColorKey;
  shadowColor: string;
  hoverShadow: string;
  href: string;
  categories: ('merchants' | 'students')[];
}

const services: ServiceItem[] = [
  {
    icon: Code,
    title: 'بناء',
    description: 'خدمات هندسيَّة وإداريَّة متكاملة للمواقع والتَّطبيقات من الفكرة حتَّى الإطلاق.',
    features: [
      'بناء متكامل من الألف إلى الياء',
      'تقنيات حديثة وأفضل الممارسات',
      'بنية آمنة وقابلة للتَّوسُّع',
    ],
    pricing: { cta: 'قراءة المزيد' },
    colorKey: 'indigo',
    shadowColor: 'shadow-indigo-500/30',
    hoverShadow: 'group-hover/item:shadow-indigo-500/50',
    href: '#web-dev-service',
    categories: ['merchants'],
  },
  {
    icon: ChatCircle,
    title: 'تدريب',
    description:
      'المسار التَّدريبي العربي المتكامل الذي يُعلِّمك بناء مواقع وتطبيقات دون كتابة كود.',
    features: [
      'يُدرِّبك خبير متخصِّص في المجال',
      'لا تحتاج لكتابة أي سطر كود',
      'التَّدريب أونلاين مع مجموعة',
    ],
    pricing: { cta: 'قراءة المزيد' },
    colorKey: 'teal',
    shadowColor: 'shadow-purple-700/30',
    hoverShadow: 'group-hover/item:shadow-purple-700/50',
    href: '#training',
    categories: ['students'],
  },
  {
    icon: Lightbulb,
    title: 'استشارات',
    description: 'نختصر عليك سنوات من البحث ونمنحك الخلاصة التِّقنيَّة والعمليَّة بصدق وأمانة.',
    features: [
      'استشارة متخصِّصة بالمواقع والتَّطبيقات',
      'نُجنِّبك خسائر الوقت والمال',
      'الاستشارة فرديَّة أونلاين صوتيَّة',
    ],
    pricing: { cta: 'قراءة المزيد' },
    colorKey: 'violet',
    shadowColor: 'shadow-violet-500/30',
    hoverShadow: 'group-hover/item:shadow-violet-500/50',
    href: '#consultation',
    categories: ['students'],
  },
];

// --- Framer Motion Variants ---
const headerVariant = {
  hidden: { opacity: 0, y: -30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 70, damping: 20 } },
} as const;

export function Services() {
  return (
    <section id="services" className="relative py-24 lg:py-32 overflow-hidden bg-[#050810]">
      {/* 
        Elite Background: Organic Floating Orbs 
        Replaced rigid pulses with Framer Motion infinite drifting mesh gradients.
      */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none mix-blend-screen z-0">
        <motion.div
          animate={{ y: [0, -40, 0], x: [0, 30, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 right-1/4 w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ y: [0, 50, 0], x: [0, -40, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ y: [0, -30, 0], x: [0, -20, 0], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-500/10 rounded-full blur-[120px]"
        />
        {/* Subtle noise texture over the gradients for a premium physical feel */}
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] mix-blend-overlay"></div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Section Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          variants={headerVariant}
          className="text-center max-w-3xl mx-auto mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
            <span className="text-sm font-medium text-white/80">خدماتنا الشاملة</span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl mb-6 font-extrabold tracking-tight text-white">
            ماذا <span className="gradient-text">نقدِّم</span>؟
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-white/60 leading-relaxed font-medium">
            بُنية تحتيَّة شاملة للأفراد وأصحاب الأعمال تحت سقف واحد، نرافقك من بلورة الفكرة وحتى
            إطلاقها بنجاح.
          </p>
        </motion.div>

        {/* 
          The Grid Layout 
          Notice the advanced Tailwind selector: [&>*:last-child]:md:col-span-2 [&>*:last-child]:lg:col-span-1
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10 [&>*:last-child]:md:col-span-2 [&>*:last-child]:lg:col-span-1 [&>*:last-child]:md:max-w-md [&>*:last-child]:md:mx-auto [&>*:last-child]:lg:max-w-none">
          {services.map((service, index) => (
            <div key={index} className="h-full">
              <ServiceCard service={service} index={index} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
