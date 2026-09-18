'use client';

import { Link2, BarChart3, Shield, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { useAnimatedCounter } from '@/frontend/shared/use-animated-counter';

interface AdminStatsCardsProps {
  totalLinks: number;
  totalClicks: number;
  blockedLinksCount: number;
}

export function AdminStatsCards({
  totalLinks,
  totalClicks,
  blockedLinksCount,
}: AdminStatsCardsProps) {
  const animatedTotalLinks = useAnimatedCounter(totalLinks);
  const animatedTotalClicks = useAnimatedCounter(totalClicks);
  const animatedBlockedCount = useAnimatedCounter(blockedLinksCount);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      <StatCard
        icon={Link2}
        label="الروابط النشطة العالمية"
        value={animatedTotalLinks}
        ariaLabel={`${totalLinks} رابط نشط`}
      />
      <StatCard
        icon={BarChart3}
        label="النقرات على مستوى النظام"
        value={animatedTotalClicks}
        ariaLabel={`${totalClicks} نقرة`}
      />
      <StatCard
        icon={Shield}
        label="الروابط الضارة المحظورة"
        value={animatedBlockedCount}
        ariaLabel={`${blockedLinksCount} رابط محظور`}
        tone="destructive"
        className="sm:col-span-2 lg:col-span-1"
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  ariaLabel,
  tone = 'primary',
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  ariaLabel: string;
  tone?: 'primary' | 'destructive';
  className?: string;
}) {
  const toneClasses =
    tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary';

  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-3.5 sm:gap-4">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl sm:size-12 ${toneClasses}`}
        >
          <Icon className="size-5 sm:size-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground block text-xs font-bold tracking-wider uppercase">
            {label}
          </span>
          <span
            className={`font-display mt-0.5 block text-2xl font-black sm:text-3xl ${
              tone === 'destructive' ? 'text-destructive' : 'text-foreground'
            }`}
            aria-live="polite"
            aria-label={ariaLabel}
          >
            {value}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
