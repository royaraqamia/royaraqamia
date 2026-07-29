'use client';

import { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Link, ChartBar, MagnifyingGlass } from '@phosphor-icons/react';

interface BentoCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  className?: string;
  delay?: number;
  children?: React.ReactNode;
}

function BentoCard({
  title,
  description,
  icon: Icon,
  gradient,
  className = '',
  delay = 0,
  children,
}: BentoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos({ x: 50, y: 50 });
  }, []);

  // Format gradient string safely for CSS radial-gradient
  const formatGradient = (colorStr: string, alpha: number) => {
    if (colorStr.startsWith('rgba')) {
      return colorStr.replace(/,\s*[\d.]+\)/, `, ${alpha})`);
    }
    if (colorStr.startsWith('rgb(')) {
      return colorStr.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    if (colorStr.startsWith('#')) {
      const hexAlpha = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0');
      return `${colorStr}${hexAlpha}`;
    }
    return colorStr;
  };

  const bgSpotlight = formatGradient(gradient, 0.12);
  const hoverSpotlight = formatGradient(gradient, 0.22);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-xl transition-all duration-500 hover:border-violet-500/40 hover:shadow-2xl hover:shadow-violet-500/10 ${className}`}
      style={{
        background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, ${bgSpotlight}, transparent 70%), rgba(15, 23, 42, 0.75)`,
      }}
    >
      {/* Ambient hover glowing spotlight layer */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: `radial-gradient(800px circle at ${mousePos.x}% ${mousePos.y}%, ${hoverSpotlight}, transparent 65%)`,
        }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between space-y-6">
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-400 shadow-inner group-hover:scale-105 group-hover:border-violet-500/40 group-hover:bg-violet-500/20 transition-all duration-300">
              <Icon
                size={26}
                className="text-violet-400 transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 group-hover:text-white transition-colors">
              {title}
            </h3>
          </div>
          <p className="text-sm sm:text-base leading-relaxed text-slate-400 font-normal">
            {description}
          </p>
        </div>

        {children && <div className="mt-auto pt-2">{children}</div>}
      </div>
    </motion.div>
  );
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
    <section
      id="features"
      dir="rtl"
      className="relative overflow-hidden py-20 sm:py-28 bg-slate-950 text-slate-100"
    >
      {/* Background visual ambiance */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-linear-to-b from-violet-600/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 sm:mb-20"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs sm:text-sm font-semibold tracking-wide mb-6 shadow-xs backdrop-blur-md">
            ✨ ميِّزات قويَّة
          </span>
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5 text-slate-100">
            كل ما تحتاجه{' '}
            <span className="bg-linear-to-r from-violet-400 via-indigo-300 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-xs">
              لإدارة الرَّوابط
            </span>
          </h2>
          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed font-normal">
            اختصِر، نظِّم، وحلِّل روابطك بأدوات قويَّة مُصمَّمَة للمبدعين والمسوِّقين.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          <BentoCard
            title="اختصار فوري"
            description="الصق أي رابط طويل واحصل على رابط قصير نظيف قابل للمشاركة بالميلي ثانية."
            icon={Link}
            gradient="rgba(139,92,246,1)"
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
            title="تتبُّع النَّقرات"
            description="اعرف بالضَّبط كم مرَّة تمَّ النَّقر على كل رابط بتتبُّع دقيق وفوري."
            icon={ChartBar}
            gradient="rgba(129,140,248,1)"
            className="lg:col-span-2"
            delay={0.2}
          >
            <MiniChart />
          </BentoCard>

          <BentoCard
            title="تحليلات متقدِّمة"
            description="افهم جمهورك من خلال تحليلات مُفصَّلَة عن أداء الرَّوابط والمواقع الجغرافيَّة والاتِّجاهات."
            icon={MagnifyingGlass}
            gradient="rgba(167,139,250,1)"
            className="lg:col-span-2"
            delay={0.3}
          >
            <AnalyticsPreview />
          </BentoCard>
        </div>
      </div>
    </section>
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
