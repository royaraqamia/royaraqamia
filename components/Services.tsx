'use client';

import { ChatCircle, Code, Lightbulb, Storefront, GraduationCap } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollAnimation } from './ScrollAnimations';
import { useUI } from '../context/UIContext';
import { ServiceCard } from './services/ServiceCard';
import type { ColorKey } from './services/colorConfigs';

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
    icon: ChatCircle,
    title: 'التَّدريب',
    description:
      'المسار التَّدريبي العربي المتكامل الذي يعلِّمك بناء موقع إلكتروني أو تطبيق دون كتابة كود.',
    features: [
      'يدرِّبك خبير متخصِّص في المجال',
      'لا تحتاج لكتابة أي سطر كود',
      'التَّدريب أونلاين مع مجموعة',
    ],
    pricing: { cta: 'قراءة المزيد' },
    colorKey: 'teal',
    shadowColor: 'shadow-teal-500/30',
    hoverShadow: 'group-hover/item:shadow-teal-500/50',
    href: '#training',
    categories: ['students'],
  },
  {
    icon: Lightbulb,
    title: 'الاستشارات',
    description: 'نختصر عليك سنوات من البحث ونمنحك الخلاصة التِّقنيَّة والعمليَّة بصدق وأمانة.',
    features: [
      'استشارة متخصِّصة بالمواقع والتَّطبيقات',
      'نُجنِّبك خسائر الوقت والمال',
      'الاستشارة فرديَّة أونلاين صوتيَّة',
    ],
    pricing: { cta: 'قراءة المزيد' },
    colorKey: 'rose',
    shadowColor: 'shadow-rose-500/30',
    hoverShadow: 'group-hover/item:shadow-rose-500/50',
    href: '#consultation',
    categories: ['students'],
  },
  {
    icon: Code,
    title: 'بناء مواقع إلكترونيَّة وتطبيقات',
    description:
      'خدمات تطوير متكاملة للمواقع والتَّطبيقات من الفكرة حتَّى الإطلاق. نبني حلول رقميَّة قابلة للتَّوسُّع، آمنة، وسهلة الاستخدام.',
    features: [
      'تطوير متكامل من الألف إلى الياء',
      'تقنيات حديثة وأفضل الممارسات',
      'بنية آمنة وقابلة للتَّوسُّع',
    ],
    pricing: { cta: 'قراءة المزيد' },
    colorKey: 'blue',
    shadowColor: 'shadow-violet-500/30',
    hoverShadow: 'group-hover/item:shadow-violet-500/50',
    href: '#web-dev-service',
    categories: ['merchants'],
  },
];

const tabs: { id: 'merchants' | 'students'; label: string; icon: React.ElementType }[] = [
  { id: 'merchants', label: 'للتُّجَّار ومقدِّمي الخدمات', icon: Storefront },
  { id: 'students', label: 'للطُّلاب والخرِّيجين الجدد', icon: GraduationCap },
];

export function Services() {
  const { activeServicesTab, setActiveServicesTab } = useUI();
  const filteredServices = services.filter((s) => s.categories.includes(activeServicesTab));

  return (
    <section id="services" className="section-spacing">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/4 right-1/4 w-64 h-64 bg-primary-600 opacity-[0.07] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-teal-500 opacity-[0.05] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s', animationDelay: '1s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-56 h-56 bg-orange-500 opacity-[0.04] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '5s', animationDelay: '2s' }}
        />
        <div
          className="absolute top-3/4 right-1/3 w-40 h-40 bg-blue-500 opacity-[0.04] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '7s', animationDelay: '3s' }}
        />
        <div
          className="absolute top-1/3 left-1/4 w-44 h-44 bg-pink-500 opacity-[0.03] rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s', animationDelay: '1.5s' }}
        />
      </div>

      <div className="max-w-7xl mx-auto container-padding">
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              ماذا <span className="gradient-text">نقدِّم</span>؟
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              بُنية تحتيَّة شاملة للأفراد وأصحاب الأعمال تحت سقف واحد
            </p>
          </div>
        </ScrollAnimation>

        <div className="py-2">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent pointer-events-none sm:hidden z-10" />
          <div className="flex overflow-x-auto justify-start sm:justify-center gap-2 p-2 scrollbar-hide sm:flex-wrap bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm max-w-7xl mx-auto container-padding">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeServicesTab === tab.id;
              const count = services.filter((s) => s.categories.includes(tab.id)).length;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveServicesTab(tab.id)}
                  className={`h-10 sm:h-10 px-3 sm:px-4 rounded-xl font-bold text-[12px] sm:text-[13px] transition-all duration-300 flex items-center justify-center gap-2 touch-target flex-shrink-0 ${
                    isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30 scale-105 border border-primary-500/50'
                      : 'text-foreground/70 hover:bg-white/10 hover:text-foreground border border-transparent hover:border-white/20'
                  }`}
                  style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
                >
                  <TabIcon
                    className={`w-4 h-4 sm:w-4 sm:h-4 transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]' : ''}`}
                    weight={isActive ? 'fill' : 'regular'}
                  />
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] ${isActive ? 'bg-white/25' : 'bg-white/10'}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeServicesTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-10"
            >
              {filteredServices.map((service, index) => (
                <ServiceCard key={index} service={service} index={index} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
