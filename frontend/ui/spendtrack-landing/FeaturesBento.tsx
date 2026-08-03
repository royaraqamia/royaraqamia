'use client';

import { motion } from 'motion/react';
import { Receipt, ChartPieSlice, TrendUp } from '@phosphor-icons/react';
import { BentoCard } from '@/frontend/ui/landing-shared/BentoCard';
import { SectionHeading } from '@/frontend/ui/landing-shared/SectionHeading';
import { formatGradientAlpha } from '@/frontend/ui/landing-shared/formatGradientAlpha';

const bentoCardTheme = {
  as: 'article' as const,
  initialY: 30,
  viewportMargin: '-60px',
  duration: 0.6,
  cardClassName:
    'group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/60 p-6 sm:p-8 backdrop-blur-xl transition-all duration-500 hover:border-border/80 hover:shadow-2xl hover:shadow-primary/10 focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-2',
  topDecor: (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent opacity-50 transition-opacity duration-500 group-hover:opacity-100"
    />
  ),
  flatContent: true,
  contentClassName: 'relative z-10 flex h-full flex-col',
  headerClassName: 'mb-4 flex items-center gap-4',
  iconBoxClassName:
    'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs ring-1 ring-primary/20 transition-transform duration-300 group-hover:scale-105 group-hover:bg-primary/15',
  iconClassName: 'text-primary transition-transform duration-300 group-hover:rotate-3',
  iconSize: 24,
  titleWrapperClassName: 'block',
  titleClassName:
    'text-xl font-bold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary',
  descriptionClassName: 'mb-6 text-sm leading-relaxed text-muted-foreground sm:text-base',
  childrenWrapperClassName: 'mt-auto w-full',
  hoverOverlayClassName:
    'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100',
  hoverOverlayInnerClassName: 'absolute inset-0 transition-opacity duration-500',
};

function bentoCardProps(rgba: string) {
  return {
    ...bentoCardTheme,
    backgroundStyle: (x: number, y: number) => ({
      backgroundImage: `radial-gradient(600px circle at ${x}% ${y}%, ${formatGradientAlpha(rgba, 0.15)}, transparent 70%)`,
      backgroundColor: 'hsl(var(--card))',
    }),
    hoverStyle: (x: number, y: number) => ({
      background: `radial-gradient(700px circle at ${x}% ${y}%, ${formatGradientAlpha(rgba, 0.08)}, transparent 65%)`,
    }),
  };
}

const expenseEntries = [
  {
    cat: 'طعام ومشروبات',
    amount: 520,
    color: 'bg-violet-500',
    ringColor: 'ring-violet-500/30',
    pct: 35,
  },
  { cat: 'مواصلات', amount: 280, color: 'bg-indigo-500', ringColor: 'ring-indigo-500/30', pct: 19 },
  { cat: 'ترفيه', amount: 150, color: 'bg-emerald-500', ringColor: 'ring-emerald-500/30', pct: 10 },
  { cat: 'فواتير', amount: 340, color: 'bg-amber-500', ringColor: 'ring-amber-500/30', pct: 23 },
  { cat: 'أخرى', amount: 190, color: 'bg-zinc-400', ringColor: 'ring-zinc-400/30', pct: 13 },
];

function ExpenseLogger() {
  return (
    <div className="space-y-4 rounded-2xl border border-border/40 bg-background/50 p-4 shadow-inner backdrop-blur-md transition-all duration-300 sm:p-5">
      <div className="flex items-center justify-between border-b border-border/30 pb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold tracking-wide text-foreground sm:text-sm">
            مصروفات اليوم
          </span>
        </div>
        <span className="inline-flex items-center rounded-full border border-border/30 bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          5 مدخلات
        </span>
      </div>

      <div className="space-y-2.5">
        {[
          {
            desc: 'قهوة',
            amount: '$4.50',
            cat: 'طعام',
            badgeColor: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
          },
          {
            desc: 'مشوار أوبر',
            amount: '$12.00',
            cat: 'مواصلات',
            badgeColor: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
          },
          {
            desc: 'غداء',
            amount: '$18.50',
            cat: 'طعام',
            badgeColor: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
          },
        ].map((item, i) => (
          <motion.div
            key={item.desc + i}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="group/item flex items-center justify-between rounded-xl border border-border/30 bg-card/40 px-3.5 py-2.5 transition-all duration-300 hover:scale-[1.01] hover:border-primary/30 hover:bg-card/80 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-primary ring-2 ring-primary/20 transition-transform duration-300 group-hover/item:scale-125" />
              <span className="text-xs font-medium text-foreground transition-colors duration-200 group-hover/item:text-primary sm:text-sm">
                {item.desc}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium sm:text-xs ${item.badgeColor}`}
              >
                {item.cat}
              </span>
              <span className="text-xs font-semibold tracking-tight text-foreground sm:text-sm">
                {item.amount}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border/40 pt-3">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">المجموع اليوم</span>
        <div className="flex items-baseline gap-1">
          <span className="bg-linear-to-r from-primary via-violet-500 to-indigo-500 bg-clip-text text-lg font-extrabold tracking-tight text-transparent sm:text-xl">
            $35.00
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoryChart() {
  return (
    <div className="space-y-4 rounded-2xl border border-border/40 bg-background/50 p-4 shadow-inner backdrop-blur-md sm:p-5">
      <div className="flex items-center justify-between border-b border-border/30 pb-2">
        <span className="text-xs font-semibold text-foreground sm:text-sm">
          المصروفات حسب التَّصنيف
        </span>
        <span className="rounded-full border border-border/20 bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground/80">
          هذا الشَّهر
        </span>
      </div>
      <div className="space-y-3.5">
        {expenseEntries.map((entry, i) => (
          <motion.div
            key={entry.cat}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
            className="group/bar"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${entry.color} ring-2 ${entry.ringColor} transition-transform duration-300 group-hover/bar:scale-125`}
                />
                <span className="text-xs font-medium text-muted-foreground transition-colors duration-200 group-hover/bar:text-foreground sm:text-sm">
                  {entry.cat}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold tracking-tight text-foreground sm:text-sm">
                  ${entry.amount}
                </span>
                <span className="min-w-8 text-right font-mono text-[11px] text-muted-foreground/80">
                  {entry.pct}%
                </span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-border/10 bg-muted/50 p-0.5">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${entry.pct}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className={`h-full rounded-full ${entry.color} shadow-xs transition-all duration-300 group-hover/bar:brightness-110`}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const months = [
  'مُحرَّم',
  'صَفَر',
  'ربيع الأوَّل',
  'ربيع الثَّاني',
  'جمادى الأولى',
  'جمادى الآخرة',
];
const monthlyData = [2100, 1850, 2400, 1980, 2250, 1750];

function MonthlyTrend() {
  const maxVal = Math.max(...monthlyData);

  return (
    <div className="space-y-4 rounded-2xl border border-border/40 bg-background/50 p-4 shadow-inner backdrop-blur-md sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border/30 pb-2">
        <span className="text-xs font-semibold text-foreground sm:text-sm">
          الاتِّجاهات الشَّهريَّة
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs">
          <TrendUp size={12} className="shrink-0 text-emerald-500 sm:size-3.5" />
          <span className="whitespace-nowrap">-12% مقابل الشَّهر الماضي</span>
        </span>
      </div>
      <div className="overflow-x-auto px-1 pb-1 pt-4">
        <div className="flex h-32 items-end justify-between gap-1.5 sm:gap-3 min-w-70">
          {monthlyData.map((val, i) => {
            const heightPercent = (val / maxVal) * 100;
            const isHighest = val === maxVal;
            return (
              <motion.div
                key={months[i]}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.06, duration: 0.5 }}
                className="group/col flex h-full flex-1 flex-col items-center justify-end"
              >
                {/* Tooltip on hover */}
                <div className="mb-1.5 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary opacity-0 transition-opacity duration-200 group-hover/col:opacity-100">
                  ${val}
                </div>

                <div className="flex h-full w-full items-end rounded-t-lg bg-muted/40 p-0.5">
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${heightPercent}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className={`w-full rounded-t-md transition-all duration-300 group-hover/col:brightness-125 ${
                      isHighest
                        ? 'bg-linear-to-t from-primary via-violet-500 to-indigo-400 shadow-md shadow-primary/20'
                        : 'bg-linear-to-t from-primary/40 to-primary/80'
                    }`}
                  />
                </div>
                <span className="mt-2 whitespace-nowrap text-[10px] font-medium text-muted-foreground transition-colors duration-200 group-hover/col:text-foreground sm:text-[11px]">
                  {months[i]}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FeaturesBento() {
  return (
    <section
      id="features"
      dir="rtl"
      className="relative overflow-hidden bg-background py-20 sm:py-28"
    >
      {/* Ambient Radial Background Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/4 h-150 w-150 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 opacity-30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-10 right-10 h-96 w-96 rounded-full bg-violet-500/10 opacity-20 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          as="header"
          badge={
            <div className="mb-6 inline-flex cursor-default items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary shadow-xs backdrop-blur-md transition-colors duration-300 hover:bg-primary/15 sm:text-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
              ميِّزات قويَّة
            </div>
          }
          wrapperClassName="mx-auto mb-14 max-w-3xl text-center sm:mb-20"
          titleClassName="mb-6 text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          titlePrefix="كل ما تحتاجه لتتبُّع "
          titleHighlight="المصروفات"
          titleHighlightClassName="bg-linear-to-r from-primary via-violet-500 to-indigo-500 bg-clip-text text-transparent"
          subtitle="سجِّل المصروفات، وصوِّر الأنماط، وتحكَّم في أموالك بأدوات بديهيَّه."
          subtitleClassName="text-base leading-relaxed text-muted-foreground sm:text-lg"
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <BentoCard
            {...bentoCardProps('rgba(139,92,246,1)')}
            title="تسجيل المصروفات"
            description="سجِّل المصروفات بسرعة مع التَّصنيفات والوصف. لا تفقد أبدًا أين تذهب أموالك."
            icon={Receipt}
            className="md:col-span-2 lg:col-span-2 lg:row-span-2"
            delay={0.1}
          >
            <ExpenseLogger />
          </BentoCard>

          <BentoCard
            {...bentoCardProps('rgba(129,140,248,1)')}
            title="تحليل التَّصنيفات"
            description="صوِّر المصروفات حسب التَّصنيف بأشرطة مُلوَّنَة ونسب مئويَّة في لمحة."
            icon={ChartPieSlice}
            className="md:col-span-2 lg:col-span-2"
            delay={0.2}
          >
            <CategoryChart />
          </BentoCard>

          <BentoCard
            {...bentoCardProps('rgba(167,139,250,1)')}
            title="الاتِّجاهات الشَّهريَّة"
            description="تتبَّع أنماط إنفاقك بمرور الوقت من خلال رسوم بيانيَّة شهريَّة ورؤى مقارنة."
            icon={TrendUp}
            className="md:col-span-2 lg:col-span-2"
            delay={0.3}
          >
            <MonthlyTrend />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
