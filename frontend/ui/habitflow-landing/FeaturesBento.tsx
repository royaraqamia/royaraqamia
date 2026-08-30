import { CalendarCheck, ChartLine, Flame, CircleCheckBig } from 'lucide-react';
import { BentoCard } from '@/frontend/ui/landing-shared/BentoCard';
import { FeaturesSection } from '@/frontend/ui/landing-shared/FeaturesSection';

const bentoCardTheme = {
  cardClassName:
    'group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/75 dark:bg-zinc-950/82 p-6 sm:p-8 transition-all duration-500 hover:border-violet-500/40 hover:shadow-2xl hover:shadow-violet-500/10 focus-within:ring-2 focus-within:ring-violet-500/50',
  contentClassName: 'relative z-10 h-full flex flex-col justify-between',
  headerClassName: 'flex items-center gap-3.5 mb-4',
  iconBoxClassName:
    'w-12 h-12 rounded-2xl bg-violet-500/14 border border-violet-500/20 flex items-center justify-center shrink-0 shadow-inner group-hover:bg-violet-500/35 group-hover:scale-105 transition-all duration-300',
  iconClassName: 'text-violet-400 group-hover:text-violet-300 transition-colors duration-300',
  iconSize: 24,
  titleClassName: 'text-xl sm:text-2xl font-bold tracking-tight text-slate-100',
  descriptionClassName: 'text-sm sm:text-base text-slate-400 leading-relaxed mb-6',
  childrenWrapperClassName: 'mt-auto pt-2',
  hoverOverlayClassName:
    'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none',
};

function bentoCardProps(rgba: string) {
  return {
    ...bentoCardTheme,
    spotlight: {
      rgba,
      backgroundAlpha: 0.12,
      hoverAlpha: 0.08,
    },
  };
}

const habits = [
  { name: 'تأمُّل', streak: 7, done: true },
  { name: 'تمارين', streak: 3, done: false },
  { name: 'قراءة', streak: 14, done: true },
  { name: 'شرب الماء', streak: 21, done: true },
];

function HabitTracker() {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/65 dark:bg-zinc-900/65 p-4 sm:p-5 space-y-3 shadow-lg">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-sm font-bold text-slate-200">عادات اليوم</span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/14 border border-emerald-500/20 text-xs font-bold text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          3/4 تمّ
        </span>
      </div>
      <div className="space-y-2.5">
        {habits.map((habit, i) => (
          <div
            key={habit.name}
            className={`landing-reveal-item group/item rounded-xl p-3 sm:p-3.5 flex items-center justify-between border transition-all duration-300 hover:scale-[1.01] ${
              habit.done
                ? 'bg-violet-500/14 border-violet-500/30 border-s-4 border-s-violet-500 shadow-xs shadow-violet-500/10'
                : 'bg-white/5 border-white/10 border-s-4 border-s-slate-600 hover:border-slate-500'
            }`}
            style={{ ['--ld' as string]: `${0.2 + i * 0.08}s` } as React.CSSProperties}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/item:scale-110 ${
                  habit.done
                    ? 'bg-violet-500/35 text-violet-300 shadow-xs shadow-violet-500/20'
                    : 'bg-slate-800 border border-slate-700 text-slate-500'
                }`}
              >
                {habit.done ? (
                  <CircleCheckBig size={18} fill="currentColor" className="text-violet-400" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-500 block" />
                )}
              </div>
              <span
                className={`text-sm font-medium truncate ${
                  habit.done ? 'text-slate-200' : 'text-slate-400'
                }`}
              >
                {habit.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/14 border border-amber-500/20 text-amber-400 shrink-0">
              <Flame size={14} fill="currentColor" className="text-amber-400" />
              <span className="text-xs font-bold tracking-wide">{habit.streak}d</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const weekLabels = ['الأسبوع ', 'الأسبوع ', 'الأسبوع ', 'الأسبوع '];
const streakData = [5, 7, 4, 6];

function StreakCalendar() {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/65 dark:bg-zinc-900/65 p-4 sm:p-5 shadow-lg">
      <div className="flex items-center justify-between mb-5 px-1">
        <span className="text-sm font-bold text-slate-200">السَّلاسل الشَّهريَّة</span>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-linear-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30">
          <Flame size={18} fill="currentColor" className="text-amber-400 animate-pulse" />
          <span className="text-lg font-black bg-linear-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">
            22
          </span>
        </div>
      </div>
      <div className="space-y-4">
        {weekLabels.map((week, i) => (
          <div
            key={`${week}-${i}`}
            className="landing-reveal-item space-y-1.5"
            style={{ ['--ld' as string]: `${0.2 + i * 0.1}s` } as React.CSSProperties}
          >
            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-slate-400 font-medium">
                {week}
                {i + 1}
              </span>
              <span className="font-bold text-slate-300">
                {streakData[i]}/{7} أيَّام
              </span>
            </div>
            <div className="flex gap-1.5 sm:gap-2">
              {Array.from({ length: 7 }).map((_, j) => {
                const isChecked = j < (streakData[i] ?? 0);
                return (
                  <div
                    key={j}
                    className={`flex-1 h-8 sm:h-9 rounded-lg flex items-center justify-center text-xs transition-all duration-300 ${
                      isChecked
                        ? 'bg-linear-to-b from-violet-500/40 to-indigo-600/30 border border-violet-500/40 text-violet-200 shadow-xs shadow-violet-500/20 font-bold'
                        : 'bg-white/6 border border-white/5 text-slate-600'
                    }`}
                  >
                    {isChecked ? (
                      <CircleCheckBig size={14} fill="currentColor" className="text-violet-300" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-700 block" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const progressStats = [
  { label: 'مُعدَّل الإنجاز', value: '78%', change: '+12%' },
  { label: 'مُتوسِّط طول السِّلسلة', value: '6.4d', change: '+2.1d' },
  { label: 'العادات الـمُتتبَّعة', value: '12', change: '+3' },
];

function ProgressAnalytics() {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/65 dark:bg-zinc-900/65 p-4 sm:p-5 space-y-5 shadow-lg">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-slate-200">نظرة عامَّة على التَّقدُّم</span>
        <span className="text-xs text-violet-400 font-medium bg-violet-500/14 border border-violet-500/20 px-2.5 py-0.5 rounded-full">
          مُحدَّث الآن
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {progressStats.map((stat, i) => (
          <div
            key={stat.label}
            className="landing-reveal-item rounded-xl border border-white/10 bg-white/6 p-3 text-center transition-all duration-300 hover:border-violet-500/30 hover:bg-white/6"
            style={{ ['--ld' as string]: `${0.3 + i * 0.1}s` } as React.CSSProperties}
          >
            <span className="text-base sm:text-xl font-bold bg-linear-to-r from-violet-300 via-purple-200 to-indigo-300 bg-clip-text text-transparent block">
              {stat.value}
            </span>
            <span className="text-[11px] sm:text-xs text-slate-400 block mt-1 line-clamp-1">
              {stat.label}
            </span>
            <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-emerald-500/14 text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
              {stat.change}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white/10 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>المُستهدَف</span>
          <span className="text-violet-300 font-bold">78% إنجاز</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={78}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="مُعدَّل الإنجاز"
          className="h-2.5 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-white/5 relative"
        >
          <div
            className="landing-grow-w h-full rounded-full bg-linear-to-r from-violet-500 via-purple-500 to-indigo-500 shadow-xs shadow-violet-500/50 relative"
            style={
              {
                ['--ld' as string]: '0.6s',
                ['--landing-target' as string]: '78%',
              } as React.CSSProperties
            }
          >
            <div className="absolute top-0 right-0 h-full w-2 bg-white/65 blur-[2px] rounded-full" />
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium pt-0.5">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}

export function FeaturesBento() {
  return (
    <FeaturesSection
      sectionClassName="relative py-20 sm:py-28 lg:py-36 overflow-hidden bg-slate-950 text-slate-100"
      decor={
        <>
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-violet-600/14 glow-blur-xl rounded-full pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-100 h-100 bg-indigo-600/14 glow-blur-lg rounded-full pointer-events-none" />
        </>
      }
      containerClassName="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
      heading={{
        wrapperClassName: 'text-center max-w-3xl mx-auto mb-14 sm:mb-20',
        titleClassName:
          'text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5 leading-tight',
        titlePrefix: 'كل ما تحتاجه ل',
        titleHighlight: 'بناء العادات',
        titleHighlightClassName:
          'bg-linear-to-r from-violet-400 via-purple-300 to-indigo-400 bg-clip-text text-transparent',
        subtitle:
          'تتبَّع، وتصوَّر، وحافظ على روتينك اليومي بأدوات مُصمَّمَة لتغيير السُّلوك الدَّائم.',
        subtitleClassName: 'text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto',
        useEase: false,
      }}
      gridClassName="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8"
    >
      <BentoCard
        {...bentoCardProps('rgba(139,92,246,1)')}
        title="تتبُّع يومي"
        description="سجِّل عاداتك يوميًّا بنقرة واحدة. متابعات بسيطة تبني الزَّخم مع الوقت."
        icon={<CalendarCheck />}
        className="lg:col-span-2 lg:row-span-2"
        delay={0.1}
      >
        <HabitTracker />
      </BentoCard>

      <BentoCard
        {...bentoCardProps('rgba(129,140,248,1)')}
        title="تقويم السَّلاسل"
        description="تصوَّر انتظامك مع تقويم السَّلاسل الأسبوعيَّة والشَّهريَّة. شاهد تقدُّمك وهو ينمو."
        icon={<Flame />}
        className="lg:col-span-2"
        delay={0.2}
      >
        <StreakCalendar />
      </BentoCard>

      <BentoCard
        {...bentoCardProps('rgba(167,139,250,1)')}
        title="تحليلات التَّقدُّم"
        description="تتبَّع معدَّلات الإنجاز ومُتوسِّط أطوال السَّلاسل، وشاهد كيف تتحسَّن عاداتك بمرور الوقت."
        icon={<ChartLine />}
        className="lg:col-span-2"
        delay={0.3}
      >
        <ProgressAnalytics />
      </BentoCard>
    </FeaturesSection>
  );
}
