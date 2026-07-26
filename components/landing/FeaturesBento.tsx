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

const barData = [35, 55, 42, 78, 62, 90, 75, 88, 95, 70, 85, 92];

function MiniChart() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium">أداء النقرات</span>
        <span className="text-2xl font-bold gradient-text">+156%</span>
      </div>
      <div className="flex items-end gap-1.5 h-24">
        {barData.map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 rounded-t-sm bg-linear-to-t from-primary/40 to-primary/20"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>يناير</span>
        <span>يونيو</span>
        <span>ديسمبر</span>
      </div>
    </div>
  );
}

const analyticsMetrics = [
  { label: 'معدل النقر', value: '4.8%', color: 'text-accent-teal' },
  { label: 'الزوار الفريدون', value: '3.2k', color: 'text-primary' },
  { label: 'الدول المستهدفة', value: '24', color: 'text-accent-orange' },
];

function AnalyticsPreview() {
  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <span className="text-sm font-medium block">نظرة عامة فورية</span>
      {analyticsMetrics.map((metric, i) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <span className="text-sm text-muted-foreground">{metric.label}</span>
          <span className={`text-lg font-bold ${metric.color}`}>{metric.value}</span>
        </motion.div>
      ))}
      <div className="pt-3 border-t border-border/40">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>آخر 24 ساعة</span>
          <span className="text-accent-teal font-medium">+12.5% ↑</span>
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
            كل ما تحتاجه <span className="gradient-text">لإدارة الروابط</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            اختصِر، نظِّم، وحلِّل روابطك بأدوات قوية مصممة للمبدعين والمسوّقين.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <BentoCard
            title="اختصار فوري"
            description="الصق أي رابط طويل واحصل على رابط قصير نظيف قابل للمشاركة بالميلي ثانية. لا حاجة للتسجيل للبدء."
            icon={Link}
            gradient="rgba(139,92,246,1)"
            className="lg:col-span-2 lg:row-span-2"
            delay={0.1}
          >
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-12 rounded-lg bg-muted flex items-center px-4">
                  <span className="text-sm text-muted-foreground truncate">
                    https://example.com/very-long-url/with-many/parameters
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <ArrowRight size={20} className="text-primary" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-primary">linksnap.app/abc123</span>
                <span className="text-xs text-muted-foreground">منذ 2 ثانية</span>
              </div>
            </div>
          </BentoCard>

          <BentoCard
            title="تتبُّع النقرات"
            description="اعرف بالضبط كم مرة تم النقر على كل رابط بتتبُّع دقيق وفوري."
            icon={ChartBar}
            gradient="rgba(45,212,191,1)"
            className="lg:col-span-2"
            delay={0.2}
          >
            <MiniChart />
          </BentoCard>

          <BentoCard
            title="تحليلات متقدمة"
            description="افهم جمهورك من خلال تحليلات مفصلة عن أداء الروابط والمواقع الجغرافية والاتجاهات."
            icon={MagnifyingGlass}
            gradient="rgba(251,146,60,1)"
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
