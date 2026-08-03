'use client';

import { motion } from 'motion/react';
import { FileText, Note, MagnifyingGlass, Check, Warning, Sparkle } from '@phosphor-icons/react';
import { BentoCard } from '@/frontend/ui/landing-shared/BentoCard';
import { SectionHeading } from '@/frontend/ui/landing-shared/SectionHeading';
import { formatGradientAlpha } from '@/frontend/ui/landing-shared/formatGradientAlpha';

const bentoCardTheme = {
  cardClassName:
    'group relative overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-900/60 backdrop-blur-xl p-6 sm:p-8 transition-all duration-500 hover:border-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 focus-within:ring-2 focus-within:ring-indigo-500/50',
  topDecor: (
    <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
  ),
  contentClassName: 'relative z-10 h-full flex flex-col justify-between',
  headerClassName: 'flex items-center gap-4 mb-4',
  iconBoxClassName:
    'w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 group-hover:border-indigo-500/50 transition-all duration-300',
  iconClassName: 'text-indigo-400 group-hover:text-indigo-300 transition-colors',
  iconSize: 24,
  titleClassName: 'text-xl sm:text-2xl font-bold tracking-tight text-neutral-100 group-hover:text-white transition-colors',
  descriptionClassName: 'text-neutral-400 text-sm sm:text-base leading-relaxed mb-6 font-normal',
  childrenWrapperClassName: 'mt-auto w-full pt-2',
  hoverOverlayClassName:
    'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none',
};

function bentoCardProps(rgba: string) {
  return {
    ...bentoCardTheme,
    backgroundStyle: (x: number, y: number) => ({
      background: `radial-gradient(600px circle at ${x}% ${y}%, ${formatGradientAlpha(rgba, 0.15)}, transparent 60%)`,
      backgroundColor: 'hsl(var(--card, 240 10% 4%))',
    }),
    hoverStyle: (x: number, y: number) => ({
      background: `radial-gradient(800px circle at ${x}% ${y}%, ${formatGradientAlpha(rgba, 0.08)}, transparent 60%)`,
    }),
  };
}

function EditorPreview() {
  const mdLines = [
    '# مرحبًا بالعالم',
    '',
    'مرحبًا بك في **رؤية رقمية** — محرِّر',
    'Markdown حديث يجعل الكتابة',
    'متعة. ركِّز على كلماتك، لا',
    'على الأدوات.',
    '',
    '## لماذا رؤية رقمية؟',
    '- معاينة فائقة السُّرعة',
    '- إدارة المسودَّات',
    '- محسَّن لمحرِّكات البحث',
  ];

  return (
    <div className="rounded-2xl border border-neutral-800/90 bg-neutral-950/80 backdrop-blur-xl p-4 sm:p-5 shadow-2xl relative overflow-hidden group/editor">
      {/* Ambient glowing backdrop circle */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Editor Header Bar */}
      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-neutral-800/80">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600/50 block shadow-xs" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600/50 block shadow-xs" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/50 block shadow-xs" />
          </div>
          <div className="mr-3 px-2.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-neutral-400 flex items-center gap-1.5">
            <FileText size={12} className="text-indigo-400" />
            <span>post.md</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-400 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
          </span>
          <span>جاري التَّحرير</span>
        </div>
      </div>

      {/* Code Editor Body */}
      <div className="font-mono text-xs leading-relaxed space-y-1.5 dir-rtl">
        {mdLines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -5 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.04, duration: 0.3 }}
            className="flex items-start gap-3 group/line hover:bg-neutral-900/60 rounded px-1.5 py-0.5 transition-colors"
          >
            <span className="select-none text-neutral-600 font-mono text-[11px] w-5 text-left shrink-0 opacity-60">
              {i + 1}
            </span>
            <div className="flex-1">
              {line.startsWith('# ') ? (
                <span className="text-indigo-300 font-bold text-sm tracking-wide block border-b border-indigo-500/20 pb-0.5">
                  <span className="text-indigo-500/60 select-none me-1">#</span>
                  {line.replace('# ', '')}
                </span>
              ) : line.startsWith('## ') ? (
                <span className="text-purple-300 font-semibold text-xs tracking-wide block mt-1">
                  <span className="text-purple-500/60 select-none me-1">##</span>
                  {line.replace('## ', '')}
                </span>
              ) : line.startsWith('- ') ? (
                <span className="text-sky-300 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0 shadow-xs" />
                  {line.replace('- ', '')}
                </span>
              ) : line.includes('**BlogPress**') ? (
                <span className="text-neutral-300">
                  {line.split('**BlogPress**')[0]}
                  <span className="px-1.5 py-0.5 mx-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30 text-[11px] shadow-xs inline-flex items-center gap-1">
                    <Sparkle size={10} className="text-indigo-400 animate-pulse" />
                    رؤية رقمية
                  </span>
                  {line.split('**BlogPress**')[1]}
                </span>
              ) : line.trim() === '' ? (
                <span className="h-4 block" />
              ) : (
                <span className="text-neutral-400">{line}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const draftStats = [
  {
    label: 'منشور',
    value: '24',
    color: 'text-indigo-400',
    bgGradient: 'from-indigo-500 to-indigo-400',
  },
  {
    label: 'مسودَّات',
    value: '7',
    color: 'text-purple-400',
    bgGradient: 'from-purple-500 to-purple-400',
  },
  {
    label: 'مجدول',
    value: '3',
    color: 'text-violet-400',
    bgGradient: 'from-violet-500 to-violet-400',
  },
];

function DraftsOverviewCard() {
  return (
    <div className="rounded-2xl border border-neutral-800/90 bg-neutral-950/80 backdrop-blur-xl p-5 sm:p-6 shadow-2xl relative overflow-hidden group/draft">
      {/* Top Gradient Stripe */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-indigo-500 via-purple-500 to-violet-500 opacity-80" />

      <div className="flex items-center justify-between mb-5 pb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-2">
          <Note size={18} className="text-indigo-400" />
          <span className="text-sm font-semibold text-neutral-200">نظرة عامَّة</span>
        </div>
        <span className="text-[11px] font-medium text-neutral-400 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800">
          آخر 30 يومًا
        </span>
      </div>

      <div className="space-y-4">
        {draftStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
            className="p-2.5 rounded-xl hover:bg-neutral-900/60 transition-colors border border-transparent hover:border-neutral-800/60"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-sm font-medium text-neutral-400">{stat.label}</span>
              <span className={`text-base sm:text-lg font-bold ${stat.color} font-mono`}>
                {stat.value}
              </span>
            </div>
            <div className="h-2 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden p-px">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${parseInt(stat.value) * 3}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className={`h-full rounded-full bg-linear-to-r ${stat.bgGradient} shadow-[0_0_10px_rgba(99,102,241,0.5)]`}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          إجمالي المنشورات
        </span>
        <span className="text-indigo-300 font-bold font-mono text-sm bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
          34
        </span>
      </div>
    </div>
  );
}

const seoChecks = [
  { label: 'الوسم العنواني', pass: true },
  { label: 'الوصف التَّعريفي', pass: true },
  { label: 'هيكل العناوين', pass: true },
  { label: 'النَّص البديل للصُّور', pass: false },
  { label: 'سهولة القراءة', pass: true },
];

function SEOPreview() {
  return (
    <div className="rounded-2xl border border-neutral-800/90 bg-neutral-950/80 backdrop-blur-xl p-5 sm:p-6 shadow-2xl relative overflow-hidden group/seo">
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-2">
          <MagnifyingGlass size={18} className="text-indigo-400" />
          <span className="text-sm font-semibold text-neutral-200">قائمة تحسين محرِّكات البحث</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 font-mono shadow-xs">
          <Sparkle size={12} className="text-emerald-400" />
          80%
        </div>
      </div>

      <div className="space-y-2.5">
        {seoChecks.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
            className="flex items-center justify-between p-2 rounded-xl hover:bg-neutral-900/60 transition-colors border border-transparent hover:border-neutral-800/50"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-110 ${
                  item.pass
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                }`}
              >
                {item.pass ? (
                  <Check size={14} weight="bold" />
                ) : (
                  <Warning size={14} weight="bold" />
                )}
              </div>
              <span className="text-xs sm:text-sm text-neutral-300 font-medium">{item.label}</span>
            </div>

            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                item.pass
                  ? 'text-emerald-400/80 bg-emerald-500/5'
                  : 'text-amber-400/80 bg-amber-500/5'
              }`}
            >
              {item.pass ? 'مكتمل' : 'تحسين'}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-neutral-800/80">
        <div className="flex items-center justify-between text-xs text-neutral-400 mb-2 font-mono">
          <span>مستوى الجودة</span>
          <span className="text-emerald-400 font-semibold">ممتاز</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden p-px">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '80%' }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-linear-to-r from-emerald-500 via-teal-400 to-indigo-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
          />
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
      className="relative py-20 sm:py-28 lg:py-32 bg-neutral-950 text-neutral-100 selection:bg-indigo-500/30 selection:text-indigo-200 overflow-hidden"
    >
      {/* Background Ambient Glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <SectionHeading
          badge={
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs sm:text-sm font-medium mb-6 backdrop-blur-md shadow-xs">
              <Sparkle size={14} className="text-indigo-400 animate-pulse" />
              <span>ميِّزات قويَّة</span>
            </div>
          }
          wrapperClassName="text-center max-w-3xl mx-auto mb-16 sm:mb-20"
          titleClassName="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5 leading-tight text-white"
          titlePrefix="كل ما تحتاجه لـ "
          titleHighlight="كتابة أفضل"
          titleHighlightClassName="bg-linear-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
          subtitle="من التَّحرير بالـ Markdown إلى تحسين محرِّكات البحث، نمنحك الأدوات اللازمة لإنشاء محتوى مميَّز."
          subtitleClassName="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed font-normal"
          useEase={false}
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
          <BentoCard
            {...bentoCardProps('rgba(139,92,246,1)')}
            title="محرِّر Markdown"
            description="اكتب بلغة الـ Markdown مع معاينة فوريَّة. لا تشتيت، فقط تحرير سريع ونظيف."
            icon={FileText}
            className="lg:col-span-2 lg:row-span-2"
            delay={0.1}
          >
            <EditorPreview />
          </BentoCard>

          <BentoCard
            {...bentoCardProps('rgba(129,140,248,1)')}
            title="إدارة المسودَّات"
            description="نظِّم كتاباتك مع المسودَّات وسير عمل النَّشر والتَّحكُّم الكامل بالإصدارات."
            icon={Note}
            className="lg:col-span-2"
            delay={0.2}
          >
            <DraftsOverviewCard />
          </BentoCard>

          <BentoCard
            {...bentoCardProps('rgba(167,139,250,1)')}
            title="تحسين محرِّكات البحث"
            description="أدوات SEO مدمجة تساعد محتواك في تحقيق ترتيب متقدِّم والوصول لقرَّاء أكثر."
            icon={MagnifyingGlass}
            className="lg:col-span-2"
            delay={0.3}
          >
            <SEOPreview />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
