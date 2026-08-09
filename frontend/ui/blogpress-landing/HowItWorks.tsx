'use client';

import { motion } from 'motion/react';
import { FileText, Eye, Globe, Sparkle } from 'lucide-react';
import { HowItWorksSection } from '@/frontend/ui/landing-shared/HowItWorksSection';

const steps = [
  {
    number: '01',
    title: 'اكتب بالـ Markdown',
    description:
      'استخدم محرِّر الـ Markdown المتطوِّر مع إبراز الصِّياغة والمعاينة المباشرة. ركِّز على محتواك.',
    icon: FileText,
  },
  {
    number: '02',
    title: 'راجع واحفظ كمسودَّة',
    description: 'احفظ المسودَّات، طوِّر كتاباتك، وشاهد معاينة دقيقة لما ستبدو عليه بعد النَّشر.',
    icon: Eye,
  },
  {
    number: '03',
    title: 'انشر وحسِّن',
    description:
      'انشر بنقرة واحدة ودَع أدوات تحسين محرِّكات البحث تساعد مقالك في الوصول للجمهور المناسب.',
    icon: Globe,
  },
];

export function HowItWorks() {
  return (
    <HowItWorksSection
      sectionClassName="relative py-20 sm:py-28 lg:py-36 overflow-hidden bg-background text-foreground"
      decor={
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/4 -z-10 -translate-x-1/2 -translate-y-1/2 transform-gpu blur-3xl"
        >
          <div className="h-112 w-200 bg-linear-to-tr from-primary/15 via-primary/5 to-transparent opacity-60 rounded-full" />
        </div>
      }
      containerClassName="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
      heading={{
        as: 'header',
        badge: (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs sm:text-sm font-medium mb-6 shadow-xs backdrop-blur-md">
            <Sparkle size={14} fill="currentColor" className="text-primary animate-pulse" />
            <span>سير عمل بسيط</span>
          </div>
        ),
        wrapperClassName: 'text-center max-w-3xl mx-auto mb-16 sm:mb-24',
        titleId: 'how-it-works-title',
        titleClassName:
          'text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] sm:leading-[1.15] mb-5',
        titlePrefix: 'ثلاث خطوات لـ ',
        titleHighlight: 'نشر سلس',
        titleHighlightClassName:
          'bg-linear-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent',
        subtitle: 'من الفكرة إلى المنشور في دقائق. لا تعقيد، فقط كتابة.',
        subtitleClassName:
          'text-base sm:text-xl text-muted-foreground leading-relaxed font-normal max-w-xl mx-auto',
        initialY: 16,
        viewportMargin: '-100px',
        duration: 0.5,
      }}
      headingAriaLabelledBy="how-it-works-title"
      timelineClassName="relative"
      connector={
        <div
          aria-hidden="true"
          className="hidden lg:block absolute top-18 right-[15%] left-[15%] h-0.5 bg-linear-to-l from-primary/10 via-primary/40 to-primary/10 z-0"
        />
      }
      stepsClassName="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 list-none p-0 m-0"
    >
      {steps.map((step, i) => {
        const Icon = step.icon;
        return (
          <motion.li
            key={step.number}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{
              delay: i * 0.15,
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative group"
          >
            <div className="h-full flex flex-col items-center text-center p-6 sm:p-8 rounded-3xl bg-card/60 dark:bg-card/30 backdrop-blur-xl border border-border/60 hover:border-primary/40 shadow-xs hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 ease-out hover:-translate-y-1.5">
              {/* Floating Step Number Pill */}
              <div className="absolute top-5 right-6 text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-muted/80 text-muted-foreground border border-border/40 group-hover:border-primary/30 group-hover:text-primary transition-colors duration-300">
                {step.number}
              </div>

              {/* Step Icon Container */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{
                  delay: i * 0.15 + 0.15,
                  duration: 0.4,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                className="relative z-10 w-20 h-20 rounded-2xl bg-linear-to-b from-primary/15 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center mb-6 shadow-md shadow-primary/5 group-hover:scale-105 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/10 transition-all duration-300"
              >
                <div className="absolute inset-0 rounded-2xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <Icon
                  size={32}
                  className="text-primary relative z-10 group-hover:rotate-3 transition-transform duration-300"
                />
              </motion.div>

              {/* Step Title & Description */}
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-3 text-foreground group-hover:text-primary transition-colors duration-300">
                {step.title}
              </h3>

              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-sm font-normal">
                {step.description}
              </p>

              {/* Subtle bottom indicator line on hover */}
              <div className="mt-auto pt-6 w-full flex justify-center">
                <div className="w-8 h-1 rounded-full bg-primary/20 group-hover:w-16 group-hover:bg-primary transition-all duration-300" />
              </div>
            </div>
          </motion.li>
        );
      })}
    </HowItWorksSection>
  );
}
