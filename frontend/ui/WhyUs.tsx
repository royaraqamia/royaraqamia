'use client';

import { Trophy, Clock, Headphones, ShieldCheck, TrendingUp, Users } from 'lucide-react';
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
    <article
      tabIndex={0}
      aria-labelledby={`reason-title-${index}`}
      className="group/why relative h-full rounded-3xl p-7 sm:p-8 lg:p-9 bg-neutral-950/60 border border-white/10 hover:border-indigo-500/30 transition-all duration-500 ease-out hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.6)] hover:shadow-indigo-500/10 flex flex-col justify-between overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 select-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-white/20 group-hover/why:before:via-indigo-400/50 before:transition-colors before:duration-500"
    >
      {/* Dynamic Ambient Spotlight Glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover/why:opacity-100 transition-opacity duration-700 ease-out pointer-events-none -z-10 bg-[radial-gradient(circle_at_50%_0%,var(--glow-color),transparent_75%)]"
        style={{ '--glow-color': reason.glowColor } as React.CSSProperties}
      />

      {/* Subtle Corner Ambient Backlight */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-0 group-hover/why:opacity-40 blur-2xl transition-opacity duration-700 pointer-events-none"
        style={{ backgroundColor: reason.glowColor }}
      />

      {/* Glass Icon Header & Badge */}
      <div className="flex items-center justify-between mb-8 sm:mb-10">
        <div
          className={`relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center bg-white/4 border border-white/10 shadow-inner group-hover/why:border-indigo-500/30 group-hover/why:bg-indigo-500/10 transition-all duration-500 ${
            prefersReducedMotion ? '' : 'group-hover/why:scale-110 group-hover/why:-rotate-3'
          }`}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover/why:opacity-20 transition-opacity duration-500 rounded-2xl blur-sm"
            style={{ background: reason.glowColor }}
          />
          <Icon
            className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-200 group-hover/why:text-white transition-colors duration-300 drop-shadow-md relative z-10"
          />
        </div>

        {/* Numeric Badge Indicator */}
        <span className="text-xs font-mono font-medium text-neutral-500 group-hover/why:text-indigo-400/80 transition-colors duration-300 bg-white/2 border border-white/5 px-2.5 py-1 rounded-full">
          0{index + 1}
        </span>
      </div>

      {/* Typography & Copy Section */}
      <div className="mt-auto">
        <h3
          id={`reason-title-${index}`}
          className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight group-hover/why:text-indigo-100 transition-colors duration-300 group-hover/why:translate-x-1 rtl:group-hover/why:-translate-x-1"
        >
          {reason.title}
        </h3>
        <p className="text-sm sm:text-base text-neutral-400 leading-relaxed font-normal group-hover/why:text-neutral-300 transition-colors duration-300">
          {reason.description}
        </p>
      </div>
    </article>
  );
}

export function WhyUs() {
  const prefersReducedMotion = useReducedMotion();

  const reasons: Reason[] = [
    {
      icon: Trophy,
      title: 'خبرة واسعة ومعتمدة',
      description: 'فريق من الخبراء مع سنوات من الخبرة في المجال الرَّقمي والتَّدريب التِّقني',
      glowColor: 'rgba(99, 102, 241, 0.25)',
    },
    {
      icon: TrendingUp,
      title: 'نتائج قابلة للقياس',
      description: 'نركِّز على تحقيق نتائج ملموسة وقابلة للقياس تساهم في نمو أعمالك وتطوير مهاراتك',
      glowColor: 'rgba(139, 92, 246, 0.25)',
    },
    {
      icon: Clock,
      title: 'مرونة في المواعيد',
      description:
        'جداول زمنيَّة مرنة تتناسب مع احتياجاتك وأوقاتك مع إمكانيَّة الوصول على مدار السَّاعة',
      glowColor: 'rgba(168, 85, 247, 0.25)',
    },
    {
      icon: Headphones,
      title: 'دعم فنِّي متواصل',
      description: 'فريق دعم متخصِّص متاح على مدار السَّاعة لمساعدتك في أي استفسار',
      glowColor: 'rgba(129, 140, 248, 0.25)',
    },
    {
      icon: ShieldCheck,
      title: 'أمان وخصوصيَّة مضمونة',
      description: 'نلتزم بأعلى معايير الأمان والخصوصيَّة لحماية بياناتك ومعلوماتك',
      glowColor: 'rgba(167, 139, 250, 0.25)',
    },
    {
      icon: Users,
      title: 'مجتمع نشط من المحترفين',
      description: 'انضم إلى شبكة واسعة من المحترفين والخبراء في مختلف المجالات التِّقنيَّة',
      glowColor: 'rgba(99, 102, 241, 0.25)',
    },
  ];

  return (
    <section
      id="why-us"
      className="relative py-24 sm:py-32 lg:py-40 overflow-hidden bg-[#080B11] text-slate-100 select-none"
      dir="rtl"
    >
      {/* Ultra-High-End Ambient Background Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Radial Center Highlight Gradient */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(99,102,241,0.15),rgba(255,255,255,0))]" />

        {/* Soft Mesh Ambient Blur Orbs */}
        <div className="absolute top-1/4 left-10 w-96 h-96 bg-indigo-600/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-purple-600/10 blur-[130px] rounded-full" />

        {/* Micro-Grid Texture Mask */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10">
        {/* Editorial Section Header */}
        <ScrollAnimation animation="slide-down" duration={0.8}>
          <header className="text-center max-w-3xl mx-auto mb-16 sm:mb-20 lg:mb-24">
            {/* Pill Tag Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300 tracking-wide uppercase mb-6 backdrop-blur-md shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              لماذا نحن
            </div>

            <h2 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.15]">
              لماذا{' '}
              <span className="bg-linear-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
                رؤية رقمية
              </span>
              ؟
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-neutral-400 leading-relaxed font-normal max-w-2xl mx-auto">
              ما يميِّزنا عن غيرنا ويجعلنا خيارك الأوَّل ومحطَّتك الآمنة في رحلة التَّحوُّل
              الرَّقمي.
            </p>
          </header>
        </ScrollAnimation>

        {/* Responsive Grid Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch">
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
