'use client';

import { Trophy, Clock, Headphones, ShieldCheck, TrendUp, Users } from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';
import { useReducedMotion } from 'motion/react';

interface Reason {
  icon: React.ElementType;
  title: string;
  description: string;
  glowColor: string;
}

interface ReasonCardProps {
  reason: Reason;
  index: number;
}

function ReasonCard({ reason, index }: ReasonCardProps) {
  const Icon = reason.icon;
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      aria-labelledby={`reason-title-${index}`}
      className="group/card relative h-full rounded-4xl p-8 lg:p-10 border border-white/5 bg-white/2 backdrop-blur-md transition-all duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] hover:border-white/15 hover:-translate-y-2 hover:shadow-2xl hover:shadow-black/50 flex flex-col items-start text-start overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      {/* Premium Ambient Hover Glow (Replaces the rainbow icons) */}
      <div
        className={`absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] pointer-events-none -z-10 bg-[radial-gradient(circle_at_50%_0%,var(--glow-color),transparent_70%)]`}
        style={{ '--glow-color': reason.glowColor } as React.CSSProperties}
      />

      {/* Minimalist Glass Icon */}
      <div
        className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 transition-transform duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] ${
          prefersReducedMotion ? '' : 'group-hover/card:scale-110 group-hover/card:-rotate-3'
        } mb-12`}
      >
        <div
          className="absolute inset-0 opacity-0 group-hover/card:opacity-20 transition-opacity duration-500 rounded-2xl"
          style={{ background: reason.glowColor }}
        />
        <Icon weight="light" className="w-7 h-7 text-white drop-shadow-sm relative z-10" />
      </div>

      {/* Content - Vertical Layout for Breathing Room */}
      <div className="mt-auto">
        <h3
          id={`reason-title-${index}`}
          className="text-xl md:text-2xl font-bold text-white mb-3 tracking-tight transition-transform duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:translate-x-1 rtl:group-hover/card:-translate-x-1"
        >
          {reason.title}
        </h3>
        <p className="text-sm md:text-base text-white/50 leading-relaxed font-medium group-hover/card:text-white/70 transition-colors duration-500">
          {reason.description}
        </p>
      </div>
    </div>
  );
}

export function WhyUs() {
  const prefersReducedMotion = useReducedMotion();

  // We keep subtle color hints for the ambient hover glows, but remove them from the default state
  const reasons: Reason[] = [
    {
      icon: Trophy,
      title: 'خبرة واسعة ومعتمدة',
      description: 'فريق من الخبراء مع سنوات من الخبرة في المجال الرَّقمي والتَّدريب التِّقني',
      glowColor: 'rgba(99, 102, 241, 0.15)', // Indigo
    },
    {
      icon: TrendUp,
      title: 'نتائج قابلة للقياس',
      description: 'نركِّز على تحقيق نتائج ملموسة وقابلة للقياس تساهم في نمو أعمالك وتطوير مهاراتك',
      glowColor: 'rgba(16, 185, 129, 0.15)', // Emerald
    },
    {
      icon: Clock,
      title: 'مرونة في المواعيد',
      description:
        'جداول زمنيَّة مرنة تتناسب مع احتياجاتك وأوقاتك مع إمكانيَّة الوصول على مدار السَّاعة',
      glowColor: 'rgba(14, 165, 233, 0.15)', // Sky
    },
    {
      icon: Headphones,
      title: 'دعم فنِّي متواصل',
      description: 'فريق دعم متخصِّص متاح على مدار السَّاعة لمساعدتك في أي استفسار',
      glowColor: 'rgba(249, 115, 22, 0.15)', // Orange
    },
    {
      icon: ShieldCheck,
      title: 'أمان وخصوصيَّة مضمونة',
      description: 'نلتزم بأعلى معايير الأمان والخصوصيَّة لحماية بياناتك ومعلوماتك',
      glowColor: 'rgba(20, 184, 166, 0.15)', // Teal
    },
    {
      icon: Users,
      title: 'مجتمع نشط من المحترفين',
      description: 'انضم إلى شبكة واسعة من المحترفين والخبراء في مختلف المجالات التِّقنيَّة',
      glowColor: 'rgba(139, 92, 246, 0.15)', // Violet
    },
  ];

  return (
    <section id="why-us" className="section-spacing relative overflow-hidden py-24 lg:py-32">
      {/* Background - Ultra Dark & Minimalist */}
      <div className="absolute inset-0 bg-[#0B0F19] z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,100vw)] h-[min(800px,100vw)] bg-white opacity-[0.015] blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto container-padding z-10">
        {/* Section Header - Massive & Editorial */}
        <ScrollAnimation animation="slide-down" duration={0.8}>
          <div className="text-center max-w-3xl mx-auto section-header mb-16 lg:mb-24">
            <h2 className="text-4xl sm:text-6xl lg:text-7xl mb-6 font-bold tracking-tight text-white/95">
              لماذا <span className="gradient-text">رؤية رقمية</span>؟
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-white/50 leading-relaxed font-medium max-w-2xl mx-auto">
              ما يميِّزنا عن غيرنا ويجعلنا خيارك الأوَّل ومحطَّتك الآمنة في رحلة التَّحوُّل
              الرَّقمي.
            </p>
          </div>
        </ScrollAnimation>

        {/* Reasons Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {reasons.map((reason, index) => {
            const delay = prefersReducedMotion ? 0 : index * 0.1;
            return (
              <ScrollAnimation key={index} animation="slide-up" delay={delay} duration={0.8}>
                <ReasonCard reason={reason} index={index} />
              </ScrollAnimation>
            );
          })}
        </div>
      </div>
    </section>
  );
}
