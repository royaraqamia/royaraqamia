import { Link, Scissors, ChartColumn } from 'lucide-react';
import { HowItWorksSection } from '@/frontend/ui/landing-shared/HowItWorksSection';
import { Reveal } from '@/frontend/ui/landing-shared/Reveal';

const steps = [
  {
    number: '01',
    title: 'الصق رابطك',
    description:
      'ألقِ أي رابط طويل في أداة الاختصار. تتعامل مع كلِّ شيء من المقالات إلى صفحات المنتجات.',
    icon: Link,
  },
  {
    number: '02',
    title: 'اختصار فوري',
    description:
      'احصل على رابط قصير نظيف ومُوجَّه في أقل من ثانية. خصِّص النَّص الاختصاري كما تُريد.',
    icon: Scissors,
  },
  {
    number: '03',
    title: 'تتبُّع الأداء',
    description:
      'راقب النَّقرات، حلِّل الاتِّجاهات، وافهم جمهورك من خلال تحليلات فوريَّة مُفصَّلَة.',
    icon: ChartColumn,
  },
];

export function HowItWorks() {
  return (
    <HowItWorksSection
      sectionClassName="relative py-20 sm:py-28 lg:py-36 overflow-hidden bg-background text-foreground"
      decor={
        <div
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
          aria-hidden="true"
        >
          <div className="h-95 w-162.5 rounded-full bg-primary/14 glow-blur-lg dark:bg-primary/25" />
        </div>
      }
      containerClassName="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
      heading={{
        badge: (
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/14 border border-primary/20 text-primary text-xs sm:text-sm font-semibold tracking-wide mb-6 transition-all duration-300 hover:bg-primary/25">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span>سير عمل بسيط</span>
          </div>
        ),
        wrapperClassName: 'text-center max-w-3xl mx-auto mb-16 sm:mb-20 lg:mb-24',
        titleClassName:
          'text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15] mb-6',
        titlePrefix: 'ثلاث خطوات ',
        titleHighlight: 'لروابط أذكى',
        titleHighlightClassName:
          'bg-linear-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent',
        subtitle: 'البدء يستغرق أقل من دقيقة. لا حاجة لبطاقة ائتمان.',
        subtitleClassName:
          'text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-normal',
      }}
      timelineClassName="relative"
      connector={
        <div
          className="hidden lg:block absolute top-[42%] left-[12%] right-[12%] h-0.5 bg-linear-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2 pointer-events-none z-0"
          aria-hidden="true"
        />
      }
      stepsClassName="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-8 relative z-10"
    >
      {steps.map((step, i) => {
        const IconComponent = step.icon;
        return (
          <Reveal
            key={step.number}
            as="li"
            delay={i * 0.15}
            className="group relative flex flex-col items-center text-center p-8 sm:p-10 rounded-3xl bg-card/75 dark:bg-card/55 border border-border/60 hover:border-primary/40 shadow-xs hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 ease-out hover:-translate-y-2"
          >
            {/* Subtle inner hover glow gradient */}
            <div className="absolute inset-0 rounded-3xl bg-linear-to-b from-primary/4 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            {/* Icon Box with Micro-Interactions */}
            <div
              className="landing-reveal-item relative z-10 w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-background border border-border/80 shadow-md group-hover:shadow-lg group-hover:border-primary/50 flex items-center justify-center mb-8 transition-all duration-300"
              style={{ ['--ld' as string]: `${i * 0.15 + 0.2}s` } as React.CSSProperties}
            >
              <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-primary/10 via-primary/5 to-transparent group-hover:from-primary/20 transition-all duration-300" />
              <IconComponent
                size={36}
                className="text-primary relative z-10 group-hover:scale-110 transition-transform duration-300 ease-out"
              />
            </div>

            {/* Step Number Badge */}
            <span className="text-xs sm:text-sm font-mono font-bold tracking-widest text-primary bg-primary/14 border border-primary/20 px-3 py-1 rounded-full mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
              {step.number}
            </span>

            {/* Step Title */}
            <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-3 tracking-tight group-hover:text-primary transition-colors duration-300">
              {step.title}
            </h3>

            {/* Step Description */}
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-sm font-normal">
              {step.description}
            </p>
          </Reveal>
        );
      })}
    </HowItWorksSection>
  );
}
