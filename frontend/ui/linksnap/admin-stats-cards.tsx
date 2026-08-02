'use client';

import { Link2, BarChart3, Shield } from 'lucide-react';
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-card p-6 rounded-xl border border-border shadow-elevated flex items-center gap-4 card-lift">
        <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
          <Link2 className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
            الروابط النشطة العالمية
          </span>
          <span
            className="text-3xl font-black text-foreground font-display mt-0.5 block"
            aria-live="polite"
            aria-label={`${totalLinks} رابط نشط`}
          >
            {animatedTotalLinks}
          </span>
        </div>
      </div>

      <div className="bg-card p-6 rounded-xl border border-border shadow-elevated flex items-center gap-4 card-lift">
        <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
          <BarChart3 className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
            النقرات على مستوى النظام
          </span>
          <span
            className="text-3xl font-black text-foreground font-display mt-0.5 block"
            aria-live="polite"
            aria-label={`${totalClicks} نقرة`}
          >
            {animatedTotalClicks}
          </span>
        </div>
      </div>

      <div className="bg-card p-6 rounded-xl border border-border shadow-elevated flex items-center gap-4 card-lift">
        <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-xl flex items-center justify-center shrink-0">
          <Shield className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
            الروابط الضارة المحظورة
          </span>
          <span
            className="text-3xl font-black text-destructive font-display mt-0.5 block"
            aria-live="polite"
            aria-label={`${blockedLinksCount} رابط محظور`}
          >
            {animatedBlockedCount}
          </span>
        </div>
      </div>
    </div>
  );
}
