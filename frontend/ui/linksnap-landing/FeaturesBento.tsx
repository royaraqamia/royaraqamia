'use client';

import { motion } from 'motion/react';
import { Link, ChartColumn, Search } from 'lucide-react';
import { BentoCard } from '@/frontend/ui/landing-shared/BentoCard';
import { FeaturesSection } from '@/frontend/ui/landing-shared/FeaturesSection';
import { formatGradientAlpha } from '@/frontend/ui/landing-shared/formatGradientAlpha';

const bentoCardTheme = {
  cardClassName:
    'group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-xl transition-all duration-500 hover:border-violet-500/40 hover:shadow-2xl hover:shadow-violet-500/10',
  contentClassName: 'relative z-10 flex h-full flex-col justify-between space-y-6',
  headerClassName: 'flex items-center gap-4 mb-4',
  iconBoxClassName:
    'flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-400 shadow-inner group-hover:scale-105 group-hover:border-violet-500/40 group-hover:bg-violet-500/20 transition-all duration-300',
  iconClassName: 'text-violet-400 transition-transform duration-300 group-hover:scale-110',
  iconSize: 26,
  titleClassName:
    'text-xl sm:text-2xl font-bold tracking-tight text-slate-100 group-hover:text-white transition-colors',
  descriptionClassName: 'text-sm sm:text-base leading-relaxed text-slate-400 font-normal',
  childrenWrapperClassName: 'mt-auto pt-2',
  hoverOverlayClassName:
    'pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700',
};

function bentoCardProps(rgba: string) {
  return {
    ...bentoCardTheme,
    backgroundStyle: (x: number, y: number) => ({
      background: `radial-gradient(600px circle at ${x}% ${y}%, ${formatGradientAlpha(rgba, 0.12)}, transparent 70%), rgba(15, 23, 42, 0.75)`,
    }),
    hoverStyle: (x: number, y: number) => ({
      background: `radial-gradient(800px circle at ${x}% ${y}%, ${formatGradientAlpha(rgba, 0.22)}, transparent 65%)`,
    }),
  };
}

const barData = [35, 55, 42, 78, 62, 90, 75, 88, 95, 70, 85, 92];

function MiniChart() {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-inner backdrop-blur-md space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-sm font-semibold text-slate-300">أداء النَّقرات</span>
        </div>
        <span className="text-2xl font-extrabold bg-linear-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent tracking-tight">
          +156%
        </span>
      </div>

      <div className="relative flex items-end gap-1.5 sm:gap-2 h-28 pt-4 pb-1">
        {/* Chart subtle horizontal grid guides */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
          <div className="border-b border-slate-700 w-full" />
          <div className="border-b border-slate-700 w-full" />
          <div className="border-b border-slate-700 w-full" />
        </div>

        {barData.map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 rounded-t-md bg-linear-to-t from-indigo-600/40 via-violet-500/80 to-indigo-400 hover:brightness-125 transition-all shadow-[0_-4px_12px_rgba(139,92,246,0.3)] relative group/bar"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs font-medium text-slate-400">
        <span>مُحرَّم</span>
        <span>جمادى الآخرة</span>
        <span>ذو الحجَّة</span>
      </div>
    </div>
  );
}

const analyticsMetrics = [
  { label: 'مُعدَّل النَّقر', value: '4.8%', color: 'text-indigo-400' },
  { label: 'الزوَّار الفريدون', value: '3.2k', color: 'text-violet-400' },
  { label: 'الدُّول المستهدفة', value: '24', color: 'text-fuchsia-400' },
];

function AnalyticsPreview() {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-inner backdrop-blur-md space-y-3.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-slate-300">نظرة عامَّة فوريَّة</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          مباشر
        </span>
      </div>

      {analyticsMetrics.map((metric, i) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-900/90 transition-all"
        >
          <span className="text-xs sm:text-sm font-medium text-slate-400">{metric.label}</span>
          <span
            className={`text-base sm:text-lg font-bold font-mono tracking-tight ${metric.color}`}
          >
            {metric.value}
          </span>
        </motion.div>
      ))}

      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span>آخر 24 ساعة</span>
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
          +12.5% ↑
        </span>
      </div>
    </div>
  );
}

export function FeaturesBento() {
  return (
    <FeaturesSection
      sectionClassName="relative overflow-hidden py-20 sm:py-28 bg-slate-950 text-slate-100"
      decor={
        <>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-linear-to-b from-violet-600/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />
        </>
      }
      containerClassName="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      heading={{
        badge: (
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs sm:text-sm font-semibold tracking-wide mb-6 shadow-xs backdrop-blur-md">
            ✨ ميِّزات قويَّة
          </span>
        ),
        wrapperClassName: 'text-center mb-16 sm:mb-20',
        titleClassName:
          'text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5 text-slate-100',
        titlePrefix: 'كل ما تحتاجه ',
        titleHighlight: 'لإدارة الرَّوابط',
        titleHighlightClassName:
          'bg-linear-to-r from-violet-400 via-indigo-300 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-xs',
        subtitle: 'اختصِر، نظِّم، وحلِّل روابطك بأدوات قويَّة مُصمَّمَة للمبدعين والمسوِّقين.',
        subtitleClassName:
          'text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed font-normal',
        useEase: false,
      }}
      gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8"
    >
      <BentoCard
        {...bentoCardProps('rgba(139,92,246,1)')}
        title="اختصار فوري"
        description="الصق أي رابط طويل واحصل على رابط قصير نظيف قابل للمشاركة بالميلي ثانية."
        icon={Link}
        className="lg:col-span-2 lg:row-span-2"
        delay={0.1}
      >
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-inner backdrop-blur-md space-y-4">
          <div className="flex items-center gap-3" dir="ltr">
            <div className="flex-1 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center px-4 overflow-hidden shadow-xs">
              <span className="text-xs sm:text-sm font-mono text-slate-400 truncate">
                https://example.com/very-long-url/with-many/parameters
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-violet-600/30 group-hover:scale-105 group-hover:bg-violet-500 transition-all">
              <ArrowRight size={20} className="text-white" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="truncate text-sm sm:text-lg font-bold font-mono bg-linear-to-r from-violet-400 to-indigo-300 bg-clip-text text-transparent">
              royaraqamia.com/abc123
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 border border-slate-800 px-2.5 py-0.5 text-[10px] text-slate-400 font-medium sm:px-3 sm:py-1 sm:text-xs">
              منذ 2 ثانية
            </span>
          </div>
        </div>
      </BentoCard>

      <BentoCard
        {...bentoCardProps('rgba(129,140,248,1)')}
        title="تتبُّع النَّقرات"
        description="اعرف بالضَّبط كم مرَّه تمَّ النَّقر على كل رابط بتتبُّع دقيق وفوري."
        icon={ChartColumn}
        className="lg:col-span-2"
        delay={0.2}
      >
        <MiniChart />
      </BentoCard>

      <BentoCard
        {...bentoCardProps('rgba(167,139,250,1)')}
        title="تحليلات متقدِّمة"
        description="افهم جمهورك من خلال تحليلات مُفصَّلَة عن أداء الرَّوابط والمواقع الجغرافيَّة والاتِّجاهات."
        icon={Search}
        className="lg:col-span-2"
        delay={0.3}
      >
        <AnalyticsPreview />
      </BentoCard>
    </FeaturesSection>
  );
}

function ArrowRight({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M5 12H19M19 12L12 5M19 12L12 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
