'use client';

import { motion } from 'motion/react';
import { MessageCircle, Code, Lightbulb } from 'lucide-react';
import { ServiceCard } from './services/ServiceCard';
import type { ColorKey } from './services/colorConfigs';

// Interfaces remain identical for seamless drop-in
interface ServiceItem {
  icon: typeof MessageCircle;
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
    icon: MessageCircle,
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

const gridContainerVariant = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
} as const;

const cardItemVariant = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 75, damping: 20 },
  },
} as const;

export function Services() {
  return (
    <section
      id="services"
      dir="rtl"
      className="relative py-24 sm:py-32 lg:py-40 overflow-hidden bg-[#030712] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200"
    >
      {/* Top Ambient Highlight Border */}
      <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-indigo-500/30 to-transparent pointer-events-none" />

      {/* Modern Architectural Dot/Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29371a_1px,transparent_1px),linear-gradient(to_bottom,#1f29371a_1px,transparent_1px)] bg-size-[3.5rem_3.5rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_35%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Dynamic Background Spotlight & Floating Mesh Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none mix-blend-screen z-0">
        <div className="animate-orb-drift-a absolute top-1/4 right-1/4 w-80 h-80 sm:w-96 sm:h-96 bg-indigo-600/15 rounded-full blur-[130px]" />
        <div className="animate-orb-drift-b absolute bottom-1/4 left-1/4 w-80 h-80 sm:w-96 sm:h-96 bg-purple-600/15 rounded-full blur-[140px]" />
        <div className="animate-orb-drift-c absolute top-1/3 left-1/2 -translate-x-1/2 w-md h-112 bg-violet-600/12 rounded-full blur-[140px]" />
        {/* Tactile Noise Overlay */}
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.025] mix-blend-overlay" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-12 relative z-10">
        {/* Section Header */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          variants={headerVariant}
          className="text-center max-w-3xl mx-auto mb-16 sm:mb-20 lg:mb-24 flex flex-col items-center"
        >
          {/* High-End Glass Pill Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800/80 backdrop-blur-xl shadow-inner text-xs font-semibold text-indigo-300 mb-6 group transition-colors duration-300 hover:border-indigo-500/40 hover:bg-slate-900">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
            </span>
            <span className="tracking-wide">خدماتنا المتميِّزة</span>
          </div>

          {/* Heading */}
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.15]">
            ماذا{' '}
            <span className="bg-linear-to-r from-indigo-400 via-purple-300 to-teal-300 bg-clip-text text-transparent drop-shadow-sm">
              نقدِّم
            </span>
            ؟
          </h2>

          {/* Subtitle */}
          <p className="text-base sm:text-lg lg:text-xl text-slate-400 leading-relaxed font-normal max-w-2xl">
            بُنية تحتيَّة شاملة للأفراد وأصحاب الأعمال تحت سقف واحد.
          </p>
        </motion.div>

        {/* Dynamic Grid Layout */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-50px' }}
          variants={gridContainerVariant}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-8 [&>*:last-child]:md:col-span-2 [&>*:last-child]:lg:col-span-1 [&>*:last-child]:md:max-w-md [&>*:last-child]:md:mx-auto [&>*:last-child]:lg:max-w-none"
        >
          {services.map((service, index) => (
            <motion.div
              key={index}
              variants={cardItemVariant}
              className="h-full flex flex-col transition-transform duration-300 ease-out hover:scale-[1.01]"
            >
              <ServiceCard service={service} index={index} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Bottom Ambient Divider Line */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-slate-800 to-transparent pointer-events-none" />
    </section>
  );
}
