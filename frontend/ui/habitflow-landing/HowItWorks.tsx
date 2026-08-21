import { CirclePlus, CircleCheckBig, Flame } from 'lucide-react';
import { HowItWorksSection } from '@/frontend/ui/landing-shared/HowItWorksSection';
import { Reveal } from '@/frontend/ui/landing-shared/Reveal';

const steps = [
  {
    number: '01',
    title: 'أضف عادة',
    description:
      'حدِّد العادات التي تُريد بناءها. الرُّوتين الصَّباحي، التَّمارين، القراءة — أيَّ شيء يهمُّك.',
    icon: CirclePlus,
  },
  {
    number: '02',
    title: 'تتبَّع يوميًّا',
    description: 'سجِّل حضورك يوميًّا وحدِّد تقدُّمك. متابعة بنعم/لا تستغرق ثوانٍ.',
    icon: CircleCheckBig,
  },
  {
    number: '03',
    title: 'ابنِ السَّلاسل',
    description: 'شاهد سلسلتك تنمو كلَّما حافظت على انتظامك. كلّ يوم يبني على الذي يليه.',
    icon: Flame,
  },
];

export function HowItWorks() {
  return (
    <HowItWorksSection
      sectionClassName="relative py-20 sm:py-28 lg:py-36 overflow-hidden section-spacing"
      decor={
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
        >
          <div className="h-112.5 w-150 sm:w-200 rounded-full bg-linear-to-tr from-primary/10 via-primary/5 to-transparent glow-blur-lg opacity-70" />
        </div>
      }
      containerClassName="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 container-padding"
      heading={{
        badge: (
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-primary/14 border border-primary/20 text-primary text-xs sm:text-sm font-semibold tracking-wide mb-6 shadow-sm shadow-primary/5 transition-all duration-300 hover:bg-primary/25 hover:border-primary/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span>سير عمل بسيط</span>
          </div>
        ),
        wrapperClassName: 'text-center mb-16 sm:mb-24',
        titleClassName:
          'text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground mb-4 sm:mb-6 leading-[1.15]',
        titlePrefix: 'ثلاث خطوات لـ ',
        titleHighlight: 'عادات دائمة',
        titleHighlightClassName:
          'gradient-text bg-linear-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent',
        subtitle: 'ابدأ صغيرًا، واظب باستمرار، وشاهد عاداتك تُغيِّر حياتك.',
        subtitleClassName:
          'text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-normal',
      }}
      timelineClassName="relative"
      connector={
        <div
          aria-hidden="true"
          className="hidden lg:block absolute top-[28%] left-[15%] right-[15%] h-0.5 bg-linear-to-r from-primary/10 via-primary/40 to-primary/10 -translate-y-1/2 z-0"
        />
      }
      stepsClassName="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-8 relative z-10 list-none m-0 p-0"
    >
      {steps.map((step, i) => {
        const StepIcon = step.icon;
        return (
          <Reveal
            key={step.number}
            as="li"
            delay={i * 0.18}
            className="group relative flex flex-col items-center text-center p-8 sm:p-10 rounded-3xl bg-card/88 dark:bg-neutral-900/82 border border-border/80 dark:border-neutral-800/80 shadow-xl shadow-black/2 hover:border-primary/40 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-2 outline-none"
          >
            {/* Subtle Background Hover Light Glow */}
            <div className="absolute inset-0 rounded-3xl bg-linear-to-b from-primary/4 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            {/* Top Glowing Stroke Highlight Accent */}
            <div className="absolute top-0 inset-x-12 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {/* Background Watermark Step Number */}
            <span
              aria-hidden="true"
              className="absolute top-6 left-6 text-4xl sm:text-5xl font-black text-primary/10 group-hover:text-primary/20 transition-colors duration-500 font-mono select-none tracking-tighter"
            >
              {step.number}
            </span>

            {/* Icon Badge Container with Micro-Interactions */}
            <div
              className="landing-reveal-item relative z-10 mb-8"
              style={{ ['--ld' as string]: `${i * 0.18 + 0.15}s` } as React.CSSProperties}
            >
              {/* Outer Glowing Aura on Hover */}
              <div className="absolute -inset-2 rounded-2xl bg-linear-to-r from-primary/30 to-primary/10 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative w-20 h-20 rounded-2xl bg-card border border-border/80 flex items-center justify-center shadow-lg shadow-primary/5 group-hover:scale-110 group-hover:border-primary/50 group-hover:shadow-primary/20 transition-all duration-500 ease-out">
                <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-primary/10 via-transparent to-primary/5" />
                <StepIcon
                  size={36}
                  className="text-primary relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3"
                />
              </div>
            </div>

            {/* Step Title & Metadata */}
            <div className="relative z-10 flex flex-col items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-wider text-primary bg-primary/14 border border-primary/20 mb-3 select-none">
                الخطوة {step.number}
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-3 tracking-tight">
                {step.title}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xs font-normal">
                {step.description}
              </p>
            </div>
          </Reveal>
        );
      })}
    </HowItWorksSection>
  );
}
