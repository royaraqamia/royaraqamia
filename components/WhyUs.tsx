'use client';

import { Trophy, Clock, Headphones, ShieldCheck, TrendUp, Users } from '@phosphor-icons/react';
import { ScrollAnimation } from './ScrollAnimations';
import { useReducedMotion } from 'motion/react';

interface Reason {
  icon: React.ElementType;
  title: string;
  description: string;
  iconGradient: string;
  iconColor: string;
  iconShadow: string;
}

interface ReasonCardProps {
  reason: Reason;
  index: number;
}

function ReasonCard({ reason, index }: ReasonCardProps) {
  const Icon = reason.icon;

  return (
    <div
      dir="rtl"
      aria-labelledby={`reason-title-${index}`}
      className="group relative h-full rounded-2xl p-6 lg:p-8 border border-white/5 border-t-white/10 hover:-translate-y-1 hover:border-violet-500/30 hover:border-t-white/20 hover:shadow-lg hover:shadow-violet-500/10 transition-all duration-300 flex flex-col sm:flex-row sm:items-center items-start text-right gap-4 sm:gap-5 bg-[rgba(25,25,32,0.7)] hover:bg-[rgba(35,35,45,0.85)] backdrop-blur-[12px] will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background gradient-border-hover"
    >
      {/* Icon - Top Right (start in RTL) */}
      <div
        className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center group-hover:scale-105 transition-all duration-300 border border-white/10 ring-1 ring-inset ring-white/20 bg-gradient-to-br ${reason.iconGradient} ${reason.iconShadow} will-change-transform`}
      >
        <Icon
          className={`w-7 h-7 ${reason.iconColor} group-hover:rotate-12 transition-transform duration-300 will-change-transform`}
        />
      </div>

      {/* Content - Right Aligned */}
      <div className="text-right flex-1">
        <h3
          id={`reason-title-${index}`}
          className="text-lg md:text-xl font-semibold text-white text-right mb-2"
        >
          {reason.title}
        </h3>
        <p className="text-sm md:text-base text-slate-300 leading-[1.8] text-right">
          {reason.description}
        </p>
      </div>
    </div>
  );
}

export function WhyUs() {
  const prefersReducedMotion = useReducedMotion();

  const reasons: Reason[] = [
    {
      icon: Trophy,
      title: 'خبرة واسعة ومعتمدة',
      description: 'فريق من الخبراء مع سنوات من الخبرة في المجال الرَّقمي والتَّدريب التِّقني',
      iconGradient: 'from-indigo-500/30 to-violet-500/25',
      iconColor: 'text-indigo-400',
      iconShadow: 'shadow-indigo-500/30',
    },
    {
      icon: TrendUp,
      title: 'نتائج قابلة للقياس',
      description: 'نركِّز على تحقيق نتائج ملموسة وقابلة للقياس تساهم في نمو أعمالك وتطوير مهاراتك',
      iconGradient: 'from-emerald-500/30 to-teal-600/25',
      iconColor: 'text-emerald-400',
      iconShadow: 'shadow-emerald-500/30',
    },
    {
      icon: Clock,
      title: 'مرونة في المواعيد',
      description:
        'جداول زمنيَّة مرنة تتناسب مع احتياجاتك وأوقاتك مع إمكانيَّة الوصول على مدار السَّاعة',
      iconGradient: 'from-sky-500/30 to-blue-600/25',
      iconColor: 'text-sky-400',
      iconShadow: 'shadow-sky-500/30',
    },
    {
      icon: Headphones,
      title: 'دعم فنِّي متواصل',
      description: 'فريق دعم متخصِّص متاح على مدار السَّاعة لمساعدتك في أي استفسار',
      iconGradient: 'from-orange-500/30 to-amber-600/25',
      iconColor: 'text-orange-400',
      iconShadow: 'shadow-orange-500/30',
    },
    {
      icon: ShieldCheck,
      title: 'أمان وخصوصيَّة مضمونة',
      description: 'نلتزم بأعلى معايير الأمان والخصوصيَّة لحماية بياناتك ومعلوماتك',
      iconGradient: 'from-teal-500/30 to-cyan-600/25',
      iconColor: 'text-teal-400',
      iconShadow: 'shadow-teal-500/30',
    },
    {
      icon: Users,
      title: 'مجتمع نشط من المحترفين',
      description: 'انضم إلى شبكة واسعة من المحترفين والخبراء في مختلف المجالات التِّقنيَّة',
      iconGradient: 'from-violet-500/30 to-purple-600/25',
      iconColor: 'text-violet-400',
      iconShadow: 'shadow-violet-500/30',
    },
  ];

  return (
    <section id="why-us" className="section-spacing relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#7766EE] opacity-5 blur-[150px] rounded-full" />
        <div className="absolute top-20 right-16 w-24 h-24 bg-[#A78BFA] opacity-10 rounded-full blur-2xl" />
        <div className="absolute bottom-32 left-12 w-32 h-32 bg-[#7766EE] opacity-10 rounded-full blur-2xl" />
      </div>

      <div className="relative max-w-7xl mx-auto container-padding">
        {/* Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
              style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
            >
              لماذا <span className="gradient-text">رؤية رقمية</span>؟
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70 leading-[1.8] sm:leading-[1.9]">
              ما يميِّزنا عن غيرنا ويجعلنا خيارك الأوَّل ومحطَّتك الآمنة في رحلة التَّحوُّل
              الرَّقمي.
            </p>
          </div>
        </ScrollAnimation>

        {/* Reasons Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {reasons.map((reason, index) => {
            const delay = prefersReducedMotion ? 0 : index * 0.15;
            return (
              <ScrollAnimation key={index} animation="scale" delay={delay} duration={0.4}>
                <ReasonCard reason={reason} index={index} />
              </ScrollAnimation>
            );
          })}
        </div>
      </div>
    </section>
  );
}
