'use client';

import { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Receipt, ChartPieSlice, TrendUp } from '@phosphor-icons/react';

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

const expenseEntries = [
  { cat: 'طعام ومشروبات', amount: 520, color: 'bg-accent-orange', pct: 35 },
  { cat: 'مواصلات', amount: 280, color: 'bg-accent-teal', pct: 19 },
  { cat: 'ترفيه', amount: 150, color: 'bg-primary', pct: 10 },
  { cat: 'فواتير', amount: 340, color: 'bg-info', pct: 23 },
  { cat: 'أخرى', amount: 190, color: 'bg-muted-foreground', pct: 13 },
];

function ExpenseLogger() {
  return (
    <div className="glass rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">مصروفات اليوم</span>
        <span className="text-xs text-muted-foreground">5 مدخلات</span>
      </div>
      <div className="space-y-2">
        {[
          { desc: 'قهوة', amount: '$4.50', cat: 'طعام' },
          { desc: 'مشوار أوبر', amount: '$12.00', cat: 'مواصلات' },
          { desc: 'غداء', amount: '$18.50', cat: 'طعام' },
        ].map((item, i) => (
          <motion.div
            key={item.desc}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.3 }}
            className="glass rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm">{item.desc}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{item.cat}</span>
              <span className="text-sm font-medium text-accent-orange">{item.amount}</span>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="pt-3 border-t border-border/40 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">المجموع اليوم</span>
        <span className="text-lg font-bold gradient-text">$35.00</span>
      </div>
    </div>
  );
}

function CategoryChart() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium">المصروفات حسب التصنيف</span>
        <span className="text-sm text-muted-foreground">هذا الشهر</span>
      </div>
      <div className="space-y-4">
        {expenseEntries.map((entry, i) => (
          <motion.div
            key={entry.cat}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${entry.color}`} />
                <span className="text-sm text-muted-foreground">{entry.cat}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">${entry.amount}</span>
                <span className="text-xs text-muted-foreground w-8 text-right">{entry.pct}%</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${entry.pct}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`h-full rounded-full ${entry.color}`}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'];
const monthlyData = [2100, 1850, 2400, 1980, 2250, 1750];

function MonthlyTrend() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium">الاتجاهات الشهرية</span>
        <span className="flex items-center gap-1 text-xs text-accent-teal">
          <TrendUp size={14} />
          -12% مقابل الشهر الماضي
        </span>
      </div>
      <div className="flex items-end gap-2 h-28">
        {monthlyData.map((val, i) => (
          <motion.div
            key={months[i]}
            initial={{ height: 0 }}
            whileInView={{ height: `${(val / 2500) * 100}%` }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 flex flex-col items-center"
          >
            <div
              className="w-full rounded-t-sm bg-linear-to-t from-primary/40 to-primary/20"
              style={{ height: '100%' }}
            />
            <span className="text-xs text-muted-foreground mt-2">{months[i]}</span>
          </motion.div>
        ))}
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
            كل ما تحتاجه لتتبُّع <span className="gradient-text">المصروفات</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            سجِّل المصروفات، وصوِّر الأنماط، وتحكَّم في أموالك بأدوات بديهية.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <BentoCard
            title="تسجيل المصروفات"
            description="سجِّل المصروفات بسرعة مع التصنيفات والوصف. لا تفقد أبداً أين تذهب أموالك."
            icon={Receipt}
            gradient="rgba(139,92,246,1)"
            className="lg:col-span-2 lg:row-span-2"
            delay={0.1}
          >
            <ExpenseLogger />
          </BentoCard>

          <BentoCard
            title="تحليل التصنيفات"
            description="صوِّر المصروفات حسب التصنيف بأشرطة ملونة ونسب مئوية في لمحة."
            icon={ChartPieSlice}
            gradient="rgba(45,212,191,1)"
            className="lg:col-span-2"
            delay={0.2}
          >
            <CategoryChart />
          </BentoCard>

          <BentoCard
            title="الاتجاهات الشهرية"
            description="تتبَّع أنماط إنفاقك بمرور الوقت من خلال رسوم بيانية شهرية ورؤى مقارنة."
            icon={TrendUp}
            gradient="rgba(251,146,60,1)"
            className="lg:col-span-2"
            delay={0.3}
          >
            <MonthlyTrend />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
