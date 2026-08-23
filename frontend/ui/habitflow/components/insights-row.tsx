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
    <Card className="group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-4 backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-border hover:bg-card/80 hover:shadow-xl hover:shadow-primary/5 focus-within:ring-2 focus-within:ring-primary/50 focus-within:ring-offset-2 focus-within:ring-offset-background sm:gap-4 sm:p-5">
      {/* Top ambient highlight stroke for Apple/Linear glassmorphic depth */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/10 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      />

      {/* Subtle background ambient blur glow */}
      <div
        className="pointer-events-none absolute -inset-e-10 -bottom-10 h-28 w-28 rounded-full bg-primary/5 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:bg-primary/10"
        aria-hidden="true"
      />

      {/* Icon container with glass inset & hardware-accelerated hover shifts */}
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 backdrop-blur-md transition-all duration-300 group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/25 group-hover:ring-primary sm:h-12 sm:w-12">
        <Icon
          className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 sm:h-6 sm:w-6"
          aria-hidden="true"
        />
      </div>

      {/* Dynamic text container preventing layout blowout */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="truncate text-xs font-medium text-muted-foreground/80 transition-colors select-none group-hover:text-muted-foreground">
          {label}
        </span>
        <p
          className="truncate text-lg font-bold text-foreground transition-colors sm:text-xl"
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
    <section aria-label="رؤى سريعة" className="w-full space-y-3.5 sm:space-y-4">
      {celebrating && (
        <div
          role="alert"
          aria-live="polite"
          className="group relative flex w-full overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-r from-primary/15 via-primary/5 to-card/40 p-4 shadow-xs backdrop-blur-xl transition-all duration-300 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10 sm:p-5"
        >
          {/* Top highlight gradient line */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/40 via-primary/20 to-transparent"
            aria-hidden="true"
          />

          {/* Ambient radial blur glow */}
          <div
            className="pointer-events-none absolute -inset-s-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl opacity-70 transition-opacity duration-500 group-hover:opacity-100"
            aria-hidden="true"
          />

          <div className="relative flex w-full items-center gap-3.5 sm:gap-4">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary ring-1 ring-inset ring-primary/30 shadow-inner sm:h-11 sm:w-11">
              <Sparkles
                className="h-5 w-5 animate-[pulse_3s_ease-in-out_infinite]"
                aria-hidden="true"
              />
            </div>
            <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-foreground/90 sm:text-base">
              واصل التَّقدُّم! سلسلتك الحاليَّة{' '}
              <span className="mx-1 inline-flex items-center whitespace-nowrap rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary ring-1 ring-inset ring-primary/30 shadow-2xs transition-transform duration-300 group-hover:scale-105">
                {insights.largestCurrentStreak} أيَّام
              </span>{' '}
              — حافظ على الأداء اليومي لبناء عادة ثابتة.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4 sm:gap-4">
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
