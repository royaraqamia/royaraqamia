'use client';

import { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { FileText, Note, MagnifyingGlass } from '@phosphor-icons/react';

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
  className,
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

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative overflow-hidden rounded-2xl border border-border/50 p-8 transition-all duration-500 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 ${className}`}
      style={{
        background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, ${gradient}15, transparent 60%)`,
        backgroundColor: 'hsl(var(--card))',
      }}
    >
      <div className="relative z-10 h-full flex flex-col">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon size={24} className="text-primary" />
          </div>
          <h3 className="text-xl font-semibold">{title}</h3>
        </div>
        <p className="text-muted-foreground leading-relaxed mb-6">{description}</p>
        {children && <div className="mt-auto">{children}</div>}
      </div>

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(800px circle at ${mousePos.x}% ${mousePos.y}%, ${gradient}08, transparent 60%)`,
          }}
        />
      </div>
    </motion.div>
  );
}

function EditorPreview() {
  const mdLines = [
    '# مرحباً بالعالم',
    '',
    'مرحباً بك في **BlogPress** — محرر',
    'ماركداون حديث يجعل الكتابة',
    'متعة. ركِّز على كلماتك، لا',
    'على الأدوات.',
    '',
    '## لماذا BlogPress؟',
    '- معاينة فائقة السرعة',
    '- إدارة المسوَّدات',
    '- محسَّن لمحركات البحث',
  ];

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-muted" />
          <span className="w-2.5 h-2.5 rounded-full bg-muted" />
          <span className="w-2.5 h-2.5 rounded-full bg-muted" />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">post.md</span>
        <span className="text-xs text-primary font-medium">● جاري التحرير</span>
      </div>
      <div className="space-y-1 font-mono text-xs">
        {mdLines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -5 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.04, duration: 0.3 }}
          >
            {line.startsWith('#') ? (
              <span className="text-primary font-bold">{line}</span>
            ) : line.startsWith('-') ? (
              <span className="text-accent-teal">{line}</span>
            ) : line.startsWith('>') ? (
              <span className="text-accent-orange italic">{line}</span>
            ) : (
              <span className="text-muted-foreground">{line}</span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const draftStats = [
  { label: 'منشور', value: '24', color: 'text-accent-teal' },
  { label: 'مسوَّدات', value: '7', color: 'text-accent-orange' },
  { label: 'مجدول', value: '3', color: 'text-primary' },
];

function DraftManager() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium">نظرة عامة</span>
        <span className="text-xs text-muted-foreground">آخر 30 يوماً</span>
      </div>
      <div className="space-y-4">
        {draftStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${parseInt(stat.value) * 3}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className={`h-full rounded-full ${stat.color.replace('text-', 'bg-')}`}
              />
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-border/40">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>إجمالي المنشورات</span>
          <span className="text-primary font-medium">34</span>
        </div>
      </div>
    </div>
  );
}

const seoChecks = [
  { label: 'الوسم العنواني', pass: true },
  { label: 'الوصف التعريفي', pass: true },
  { label: 'هيكل العناوين', pass: true },
  { label: 'النص البديل للصور', pass: false },
  { label: 'سهولة القراءة', pass: true },
];

function SEOPreview() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium">قائمة تحسين محركات البحث</span>
        <span className="text-sm font-bold text-accent-teal">80%</span>
      </div>
      <div className="space-y-3">
        {seoChecks.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
            className="flex items-center gap-3"
          >
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                item.pass ? 'bg-success/20' : 'bg-warning/20'
              }`}
            >
              <span className={`text-xs font-bold ${item.pass ? 'text-success' : 'text-warning'}`}>
                {item.pass ? '✓' : '!'}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">{item.label}</span>
          </motion.div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-border/40">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '80%' }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
          />
        </div>
      </div>
    </div>
  );
}

export function FeaturesBento() {
  return (
    <section id="features" className="section-spacing">
      <div className="max-w-6xl mx-auto container-padding">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            ميزات قوية
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            كل ما تحتاجه لـ <span className="gradient-text">كتابة أفضل</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            من التحرير بالماركداون إلى تحسين محركات البحث، يمنحك BlogPress الأدوات اللازمة لإنشاء
            محتوى مميز.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <BentoCard
            title="محرر ماركداون"
            description="اكتب بلغة الماركداون مع معاينة فورية. لا تشتيت، فقط تحرير سريع ونظيف."
            icon={FileText}
            gradient="rgba(139,92,246,1)"
            className="lg:col-span-2 lg:row-span-2"
            delay={0.1}
          >
            <EditorPreview />
          </BentoCard>

          <BentoCard
            title="إدارة المسوَّدات"
            description="نظّم كتاباتك مع المسوَّدات وسير عمل النشر والتحكم الكامل بالإصدارات."
            icon={Note}
            gradient="rgba(45,212,191,1)"
            className="lg:col-span-2"
            delay={0.2}
          >
            <DraftManager />
          </BentoCard>

          <BentoCard
            title="تحسين محركات البحث"
            description="أدوات SEO مدمجة تساعد محتواك في تحقيق ترتيب متقدّم والوصول لقرّاء أكثر."
            icon={MagnifyingGlass}
            gradient="rgba(251,146,60,1)"
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
