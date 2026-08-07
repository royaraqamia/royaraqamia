'use client';

import { CalendarClock, Clock3, HeartPulse, Trophy, Sparkles } from 'lucide-react';
import { HabitInsights, isCelebrationStreak } from '@/frontend/shared/habitflow/habit-insights';
import { Card } from '@/frontend/ui/primitives/card';

interface InsightCardProps {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}

function InsightCard({ icon: Icon, label, value }: InsightCardProps) {
  return (
    <Card className="flex items-center gap-3 p-3.5 rounded-2xl border-border/60 bg-card/80 backdrop-blur-8xl hover:border-border/90 transition-colors duration-200">
      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-bold text-foreground truncate">{value}</p>
      </div>
    </Card>
  );
}

interface InsightsRowProps {
  insights: HabitInsights | null;
}

export function InsightsRow({ insights }: InsightsRowProps) {
  if (!insights) return null;

  const celebrating = isCelebrationStreak(insights.largestCurrentStreak);

  return (
    <section aria-label="رؤى سريعة">
      {celebrating && (
        <div className="mb-3 flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="text-xs sm:text-sm font-semibold text-foreground leading-snug">
            واصل التقدّم! سلسلتك الحالية{' '}
            <span className="text-primary">{insights.largestCurrentStreak} أيام</span> — حافظ على
            الأداء اليومي لبناء عادة ثابتة.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InsightCard
          icon={CalendarClock}
          label="أفضل يوم أسبوعيًا"
          value={insights.bestDayOfWeek ?? '—'}
        />
        <InsightCard icon={Clock3} label="أفضل وقت" value={insights.bestHour ?? '—'} />
        <InsightCard icon={HeartPulse} label="معدل التعافي" value={`${insights.recoveryRate}%`} />
        <InsightCard icon={Trophy} label="أطول سلسلة" value={`${insights.largestStreak} أيام`} />
      </div>
    </section>
  );
}
