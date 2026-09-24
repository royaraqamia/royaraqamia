import { MotionReveal } from './MotionReveal';

// --- Metric data ---

// Separated numeric value and suffix for the animation logic
const metrics = [
  {
    numericValue: 7,
    suffix: '+',
    label: 'سنوات من الخبرة',
    description: 'في السُّوق الرَّقمي',
    colorKey: 'purple' as const,
  },
  {
    numericValue: 100,
    suffix: '+',
    label: 'مشروع رقمي',
    description: 'ساهمنا في تصميمها من مواقع وتطبيقات',
    colorKey: 'violet' as const,
  },
  {
    numericValue: 400,
    suffix: '+',
    label: 'ساعة إجماليَّة',
    description: 'في التَّدريب وتقديم الاستشارات',
    colorKey: 'indigo' as const,
  },
];

// Upgraded color configs with text gradients and ambient shadows
const colorConfigs = {
  purple: {
    bgHover: 'group-hover/card:bg-purple-500/[0.04]',
    borderHover: 'group-hover/card:border-purple-500/40',
    textGradient: 'from-purple-300 via-purple-400 to-indigo-400',
    dividerGradient: 'from-purple-500 via-purple-400/80 to-transparent',
    shadow: 'group-hover/card:shadow-[0_0_50px_-12px_rgba(168,85,247,0.25)]',
    glowBg: 'bg-purple-500/20',
  },
  indigo: {
    bgHover: 'group-hover/card:bg-indigo-500/[0.04]',
    borderHover: 'group-hover/card:border-indigo-500/40',
    textGradient: 'from-indigo-300 via-indigo-400 to-sky-400',
    dividerGradient: 'from-indigo-500 via-indigo-400/80 to-transparent',
    shadow: 'group-hover/card:shadow-[0_0_50px_-12px_rgba(99,102,241,0.25)]',
    glowBg: 'bg-indigo-500/20',
  },
  violet: {
    bgHover: 'group-hover/card:bg-violet-500/[0.04]',
    borderHover: 'group-hover/card:border-violet-500/40',
    textGradient: 'from-violet-300 via-violet-400 to-fuchsia-400',
    dividerGradient: 'from-violet-500 via-violet-400/80 to-transparent',
    shadow: 'group-hover/card:shadow-[0_0_50px_-12px_rgba(139,92,246,0.25)]',
    glowBg: 'bg-violet-500/20',
  },
};

export function MetricCards() {
  return (
    <section
      aria-label="Key Performance Indicators"
      className="relative py-20 sm:py-28 lg:py-36 overflow-hidden bg-[#030712] text-white selection:bg-purple-500/30 selection:text-purple-200"
    >
      {/* Ambient Visual Atmosphere & Subtle Developer Tech Grid */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

        {/* Top and bottom subtle section boundaries */}
        <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <MotionReveal
          from="none"
          className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 lg:gap-8 xl:gap-10"
        >
          {metrics.map((metric, index) => {
            const colors = colorConfigs[metric.colorKey];

            return (
              <article
                key={index}
                className={` group/card relative rounded-3xl p-6 sm:p-8 lg:p-10 xl:p-12 transition-[transform,border-color] duration-500 ease-out overflow-hidden bg-neutral-900/95 border border-white/10 z-10 hover:-translate-y-2 hover:shadow-2xl ${colors.borderHover} ${colors.shadow}`}
              >
                {/* Premium Ambient Background Tint on Hover */}
                <div
                  className={`absolute inset-0 transition-colors duration-500 -z-10 ${colors.bgHover}`}
                />

                <div className="flex flex-col h-full relative z-10">
                  {/* Data & Editorial Content */}
                  <div className="mt-auto flex flex-col items-center text-center">
                    {/* The Number Container with Dual-Layer Hover Gradient Transition */}
                    <div className="relative text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight leading-none mb-6 transition-transform duration-500 ease-out group-hover/card:scale-105">
                      {/* Base White Display Number */}
                      <span className="text-white transition-opacity duration-500 group-hover/card:opacity-0 block tabular-nums">
                        {metric.numericValue}
                        {metric.suffix}
                      </span>

                      {/* Hover Gradient Text Reveal Layer */}
                      <span
                        className={`absolute inset-0 bg-linear-to-r ${colors.textGradient} bg-clip-text text-transparent opacity-0 transition-opacity duration-500 group-hover/card:opacity-100 pointer-events-none block tabular-nums`}
                        aria-hidden="true"
                      >
                        {metric.numericValue}
                        {metric.suffix}
                      </span>
                    </div>

                    {/* Dynamic Gradient Accent Divider */}
                    <div
                      className={`w-12 h-1 rounded-full mx-auto mb-6 transition-[width] duration-500 ease-out group-hover/card:w-24 bg-linear-to-r ${colors.dividerGradient}`}
                      aria-hidden="true"
                    />

                    {/* Label */}
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2.5 transition-colors duration-300">
                      {metric.label}
                    </h3>

                    {/* Description */}
                    <p className="text-sm sm:text-base text-neutral-400 group-hover/card:text-neutral-300 leading-relaxed font-normal transition-colors duration-300">
                      {metric.description}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </MotionReveal>
      </div>
    </section>
  );
}
