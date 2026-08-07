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
    <Card className="group relative flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-xs hover:shadow-md hover:border-border/90 hover:bg-card/90 transition-all duration-300 ease-out hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary/20">
      {/* Icon container with interactive glow & subtle color transition */}
      <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/20 transition-all duration-300 shrink-0">
        <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
      </div>

      {/* Label and dynamic dynamic metric display */}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 truncate select-none">
          {label}
        </p>
        <p
          className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate mt-0.5"
          title={value}
        >
          {value}
        </p>
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
    <section aria-label="رؤى سريعة" className="w-full space-y-3.5">
      {celebrating && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-linear-to-r from-primary/10 via-primary/5 to-transparent p-3.5 sm:p-4 shadow-sm backdrop-blur-md transition-all duration-300">
          {/* Subtle ambient blur effect for high-end depth */}
          <div className="absolute -inset-e-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/20 text-primary ring-1 ring-primary/30 shadow-xs shrink-0">
              <Sparkles className="w-4.5 h-4.5 animate-pulse" />
            </div>
            <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
              واصل التَّقدُّم! سلسلتك الحاليَّة{' '}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/20">
                {insights.largestCurrentStreak} أيَّام
              </span>{' '}
              — حافظ على الأداء اليومي لبناء عادة ثابتة.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <InsightCard
          icon={CalendarClock}
          label="أفضل يوم أسبوعيًّا"
          value={insights.bestDayOfWeek ?? '—'}
        />
        <InsightCard icon={Clock3} label="أفضل وقت" value={insights.bestHour ?? '—'} />
        <InsightCard
          icon={HeartPulse}
          label="مُعدَّل التَّعافي"
          value={`${insights.recoveryRate}%`}
        />
        <InsightCard icon={Trophy} label="أطول سلسلة" value={`${insights.largestStreak} أيَّام`} />
      </div>
    </section>
  );
}
