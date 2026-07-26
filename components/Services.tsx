'use client';

import { ChatCircle, Code, Lightbulb } from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';
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
    title: 'تدريب',
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
    title: 'استشارات',
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
    title: 'بناء',
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

export function Services() {
  return (
    <section id="services" className="section-spacing overflow-hidden">
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
            <h2 className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold">
              ماذا <span className="gradient-text">نقدِّم</span>؟
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              بُنية تحتيَّة شاملة للأفراد وأصحاب الأعمال تحت سقف واحد
            </p>
          </div>
        </ScrollAnimation>

        <div className="mt-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
            {services.map((service, index) => (
              <ServiceCard key={index} service={service} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
