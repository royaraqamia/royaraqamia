'use client';

import { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { CalendarCheck, ChartLineUp, Fire } from '@phosphor-icons/react';

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

const habits = [
  { name: 'تأمُّل', streak: 7, done: true },
  { name: 'تمارين', streak: 3, done: false },
  { name: 'قراءة', streak: 14, done: true },
  { name: 'شرب الماء', streak: 21, done: true },
];

function HabitTracker() {
  return (
    <div className="glass rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">عادات اليوم</span>
        <span className="text-xs text-muted-foreground">3/4 تم</span>
      </div>
      {habits.map((habit, i) => (
        <motion.div
          key={habit.name}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 + i * 0.08, duration: 0.4 }}
          className={`glass rounded-lg p-3 flex items-center justify-between ${
            habit.done ? 'border-l-2 border-success' : 'border-l-2 border-muted'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                habit.done ? 'bg-success/20' : 'bg-muted'
              }`}
            >
              {habit.done ? (
                <span className="text-success text-sm font-bold">✓</span>
              ) : (
                <span className="text-muted-foreground text-sm">○</span>
              )}
            </div>
            <span className="text-sm font-medium">{habit.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Fire size={14} className="text-accent-orange" />
            <span className="text-xs text-muted-foreground">{habit.streak}d</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

const weekLabels = ['الأسبوع ١', 'الأسبوع ٢', 'الأسبوع ٣', 'الأسبوع ٤'];
const streakData = [5, 7, 4, 6];

function StreakCalendar() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium">السلاسل الشهرية</span>
        <div className="flex items-center gap-1">
          <Fire size={16} className="text-accent-orange" />
          <span className="text-lg font-bold gradient-text">22</span>
        </div>
      </div>
      <div className="space-y-4">
        {weekLabels.map((week, i) => (
          <motion.div
            key={week}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">{week}</span>
              <span className="text-xs font-medium">
                {streakData[i]}/{7} أيام
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 7 }).map((_, j) => (
                <div
                  key={j}
                  className={`flex-1 h-8 rounded-md flex items-center justify-center text-xs ${
                    j < (streakData[i] ?? 0)
                      ? 'bg-gradient-to-b from-primary/40 to-primary/20 text-primary font-medium'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {j < (streakData[i] ?? 0) ? '✓' : '·'}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const progressStats = [
  { label: 'معدل الإنجاز', value: '78%', change: '+12%' },
  { label: 'متوسط طول السلسلة', value: '6.4d', change: '+2.1d' },
  { label: 'العادات المُتتبَّعة', value: '12', change: '+3' },
];

function ProgressAnalytics() {
  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <span className="text-sm font-medium block">نظرة عامة على التقدُّم</span>
      <div className="grid grid-cols-3 gap-3">
        {progressStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
            className="glass rounded-lg p-3 text-center"
          >
            <span className="text-lg font-bold gradient-text block">{stat.value}</span>
            <span className="text-xs text-muted-foreground block mt-1">{stat.label}</span>
            <span className="text-xs text-accent-teal font-medium">{stat.change}</span>
          </motion.div>
        ))}
      </div>
      <div className="pt-3 border-t border-border/40">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '78%' }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>0%</span>
          <span className="text-primary font-medium">78% إنجاز</span>
          <span>100%</span>
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
            كل ما تحتاجه ل<span className="gradient-text">بناء العادات</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            تتبَّع، وتصوَّر، وحافظ على روتينك اليومي بأدوات مصمَّمة لتغيير السلوك الدائم.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <BentoCard
            title="تتبُّع يومي"
            description="سجِّل عاداتك يومياً بنقرة واحدة. متابعات بسيطة تبني الزخم مع الوقت."
            icon={CalendarCheck}
            gradient="rgba(139,92,246,1)"
            className="lg:col-span-2 lg:row-span-2"
            delay={0.1}
          >
            <HabitTracker />
          </BentoCard>

          <BentoCard
            title="تقويم السلاسل"
            description="تصوَّر انتظامك مع تقويم السلاسل الأسبوعية والشهرية. شاهد تقدُّمك وهو ينمو."
            icon={Fire}
            gradient="rgba(45,212,191,1)"
            className="lg:col-span-2"
            delay={0.2}
          >
            <StreakCalendar />
          </BentoCard>

          <BentoCard
            title="تحليلات التقدُّم"
            description="تتبَّع معدلات الإنجاز ومتوسط أطوال السلاسل، وشاهد كيف تتحسن عاداتك بمرور الوقت."
            icon={ChartLineUp}
            gradient="rgba(251,146,60,1)"
            className="lg:col-span-2"
            delay={0.3}
          >
            <ProgressAnalytics />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
