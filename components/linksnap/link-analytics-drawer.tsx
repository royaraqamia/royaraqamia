'use client';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AlertTriangle, Globe, Smartphone } from 'lucide-react';
import { AnalyticsChart } from './analytics-chart';
import { AnalyticsSkeleton } from '@/components/linksnap/loading-skeletons';

export interface AnalyticsData {
  totalClicks: number;
  clicksByDate: { date: string; clicks: number }[];
  topReferrers: { name: string; count: number }[];
  recentClicks: {
    id: string;
    clickedAt: string;
    referrer: string | null;
    userAgent: string | null;
    ipCountry: string | null;
  }[];
}

interface LinkAnalyticsDrawerProps {
  isExpanded: boolean;
  analyticsLoading: boolean;
  analyticsError: string | null;
  analytics: AnalyticsData | null;
}

export function LinkAnalyticsDrawer({
  isExpanded,
  analyticsLoading,
  analyticsError,
  analytics,
}: LinkAnalyticsDrawerProps) {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={reducedMotion ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reducedMotion ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
          className="border-t border-border/50 bg-muted/30"
        >
          <div className="p-6 space-y-6" aria-live="polite">
            {analyticsLoading ? (
              <AnalyticsSkeleton />
            ) : analyticsError ? (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg flex items-center gap-1.5">
                <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" />
                <span>{analyticsError}</span>
              </div>
            ) : analytics ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between card-lift">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      إجمالي النقرات
                    </span>
                    <span className="text-2xl font-bold text-foreground font-display mt-1">
                      {analytics.totalClicks}
                    </span>
                  </div>
                  <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between card-lift">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      أعلى مصدر إحالة
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate mt-2">
                      {analytics.topReferrers[0]?.name || 'مباشر / غير معروف'}
                    </span>
                  </div>
                  <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between col-span-2 md:col-span-1 card-lift">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      حالة الرابط
                    </span>
                    <span className="text-xs font-semibold text-success bg-success/10 border border-success/30 px-2 py-0.5 rounded-full w-max mt-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                      نشط وسليم
                    </span>
                  </div>
                </div>

                <AnalyticsChart stats={analytics.clicksByDate} />

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-card p-5 rounded-xl border border-border shadow-sm space-y-3.5 card-lift">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Globe aria-hidden="true" className="w-4 h-4 text-primary" />
                      أهم مصادر الزيارات
                    </p>
                    {analytics.topReferrers.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        لم يتم جمع بيانات الإحالة بعد.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.topReferrers.map((ref, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span
                              className="text-muted-foreground font-mono truncate max-w-45"
                              title={ref.name}
                            >
                              {ref.name}
                            </span>
                            <span className="font-mono font-bold text-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                              {ref.count} نقرة
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-card p-5 rounded-xl border border-border shadow-sm space-y-3.5 card-lift">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Smartphone aria-hidden="true" className="w-4 h-4 text-primary" />
                      نشاط النقرات الأخيرة
                    </p>
                    {analytics.recentClicks.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        لا يوجد نشاط إعادة توجيه بعد.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-35 overflow-y-auto pr-1">
                        {analytics.recentClicks.map((click) => (
                          <div
                            key={click.id}
                            className="flex items-center justify-between text-xs border-b border-border/50 pb-1.5 last:border-none"
                          >
                            <span
                              className="text-muted-foreground truncate max-w-37.5"
                              title={click.userAgent || 'جهاز غير معروف'}
                            >
                              {click.userAgent
                                ? click.userAgent.length > 30
                                  ? click.userAgent.substring(0, 30) + '...'
                                  : click.userAgent
                                : 'متصفح غير معروف'}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {new Date(click.clickedAt).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
