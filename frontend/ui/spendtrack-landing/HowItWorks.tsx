import { Receipt, ChartPie, TrendingUp } from 'lucide-react';
import { HowItWorksSection } from '@/frontend/ui/landing-shared/HowItWorksSection';
import { Reveal } from '@/frontend/ui/landing-shared/Reveal';

const steps = [
  {
    number: '01',
    title: 'سجِّل مصروفاتك',
    description: 'أضف كل مصروف مع تصنيفه ومبلغه ووصفه. إدخال بيانات بسيط وسريع.',
    icon: Receipt,
  },
  {
    number: '02',
    title: 'صوِّر الأنماط',
    description:
      'اعرف أين تذهب أموالك من خلال تحليل التَّصنيفات والرُّسوم البيانيَّة والاتِّجاهات اليوميَّة.',
    icon: ChartPie,
  },
  {
    number: '03',
    title: 'تحكَّم في ميزانيَّتك',
    description:
      'استخدم التَّحليلات والاتِّجاهات الشَّهريَّة لاتِّخاذ قرارات ماليَّة أذكى وتوفير المزيد.',
    icon: TrendingUp,
  },
];

export function HowItWorks() {
  return (
    <HowItWorksSection
      sectionClassName="relative py-24 sm:py-32 lg:py-40 overflow-hidden bg-background text-foreground transition-colors duration-300"
      decor={
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
          >
            <div className="h-112.5 w-175 rounded-full bg-primary/14 glow-blur-lg opacity-60" />
            <div className="absolute top-1/4 -right-24 h-75 w-75 rounded-full bg-emerald-500/14 glow-blur-md" />
            <div className="absolute bottom-1/4 -left-24 h-75 w-75 rounded-full bg-cyan-500/14 glow-blur-md" />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"
          />
        </>
      }
      containerClassName="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
      heading={{
        badge: (
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/14 border border-primary/20 text-primary text-xs sm:text-sm font-semibold tracking-wide mb-6 shadow-xs transition-transform duration-300 hover:scale-105">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span>سير عمل بسيط</span>
          </div>
        ),
        wrapperClassName: 'text-center mb-16 sm:mb-20 lg:mb-24 max-w-3xl mx-auto',
        titleId: 'how-it-works-heading',
        titleClassName:
          'text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground mb-6 leading-tight sm:leading-[1.18]',
        titlePrefix: 'ثلاث خطوات نحو ',
        titleHighlight: 'الوضوح المالي',
        titleHighlightClassName:
          'bg-linear-to-r from-primary via-emerald-500 to-teal-400 bg-clip-text text-transparent drop-shadow-xs',
        subtitle: 'ابدأ بتتبُّع مصروفاتك اليوم وتمتَّع برؤية كاملة لعادات الإنفاق الخاصَّة بك.',
        subtitleClassName:
          'text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-normal',
        initialY: 24,
      }}
      headingAriaLabelledBy="how-it-works-heading"
      timelineClassName="relative"
      connector={
        <div
          aria-hidden="true"
          className="hidden lg:block absolute top-32.5 left-[15%] right-[15%] h-0.5 bg-linear-to-r from-border/10 via-primary/30 to-border/10 z-0"
        >
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-primary to-transparent animate-pulse opacity-60" />
        </div>
      }
      stepsClassName="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-8 relative z-10 list-none p-0 m-0"
    >
      {steps.map((step, i) => {
        const StepIcon = step.icon;
        return (
          <Reveal
            key={step.number}
            as="li"
            delay={i * 0.15}
            tabIndex={0}
            className="group relative flex flex-col items-center text-center p-8 sm:p-10 rounded-3xl bg-card/75 hover:bg-card/95 border border-border/60 hover:border-primary/40 shadow-lg hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 ease-out hover:-translate-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* Subtle Inner Card Lighting Effect */}
            <div className="absolute inset-x-0 top-0 h-px rounded-t-3xl bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {/* Monospace Ambient Step Counter Background */}
            <span
              aria-hidden="true"
              className="absolute top-4 left-6 sm:top-6 sm:left-8 text-5xl sm:text-6xl font-black text-foreground/5 group-hover:text-primary/15 transition-colors duration-500 select-none font-mono tracking-tighter"
            >
              {step.number}
            </span>

            {/* Icon Container with Glow Effect */}
            <div
              className="landing-reveal-item relative z-10 w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-linear-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20 group-hover:border-primary/50 flex items-center justify-center mb-8 shadow-md group-hover:shadow-xl group-hover:shadow-primary/20 transition-all duration-500"
              style={{ ['--ld' as string]: `${i * 0.15 + 0.1}s` } as React.CSSProperties}
            >
              <div className="absolute inset-0 rounded-2xl bg-primary/14 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <StepIcon
                size={36}
                className="text-primary relative z-10 transition-transform duration-500 group-hover:scale-110"
                aria-hidden="true"
              />
            </div>

            {/* Step Badge */}
            <span className="inline-block px-3 py-1 rounded-full bg-primary/14 text-primary text-xs font-bold tracking-wider mb-4 border border-primary/15 font-mono">
              الخطوة {step.number}
            </span>

            {/* Title */}
            <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors duration-300">
              {step.title}
            </h3>

            {/* Description */}
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-sm sm:max-w-xs font-normal">
              {step.description}
            </p>
          </Reveal>
        );
      })}
    </HowItWorksSection>
  );
}
