'use client';

import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Globe, Smartphone } from 'lucide-react';
import { AnalyticsChart } from './analytics-chart';
import { AnalyticsSkeleton } from '@/components/linksnap/ui/skeleton';

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
  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-slate-50 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50"
        >
          <div className="p-6 space-y-6">
            {analyticsLoading ? (
              <AnalyticsSkeleton />
            ) : analyticsError ? (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center gap-1.5">
                <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" />
                <span>{analyticsError}</span>
              </div>
            ) : analytics ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      إجمالي النقرات
                    </span>
                    <span className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-display mt-1">
                      {analytics.totalClicks}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      أعلى مصدر إحالة
                    </span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate mt-2">
                      {analytics.topReferrers[0]?.name || 'مباشر / غير معروف'}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between col-span-2 md:col-span-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      حالة الرابط
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 px-2 py-0.5 rounded-full w-max mt-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      نشط وسليم
                    </span>
                  </div>
                </div>

                <AnalyticsChart stats={analytics.clicksByDate} />

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-3.5">
                    <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Globe aria-hidden="true" className="w-4 h-4 text-indigo-500" />
                      أهم مصادر الزيارات
                    </h4>
                    {analytics.topReferrers.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
                        لم يتم جمع بيانات الإحالة بعد.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.topReferrers.map((ref, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span
                              className="text-slate-600 dark:text-slate-400 font-mono truncate max-w-[180px]"
                              title={ref.name}
                            >
                              {ref.name}
                            </span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                              {ref.count} نقرة
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-3.5">
                    <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Smartphone aria-hidden="true" className="w-4 h-4 text-indigo-500" />
                      نشاط النقرات الأخيرة
                    </h4>
                    {analytics.recentClicks.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
                        لا يوجد نشاط إعادة توجيه بعد.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {analytics.recentClicks.map((click) => (
                          <div
                            key={click.id}
                            className="flex items-center justify-between text-[10px] border-b border-slate-50 dark:border-slate-700 pb-1.5 last:border-none"
                          >
                            <span
                              className="text-slate-500 dark:text-slate-400 truncate max-w-[150px]"
                              title={click.userAgent || 'جهاز غير معروف'}
                            >
                              {click.userAgent
                                ? click.userAgent.length > 30
                                  ? click.userAgent.substring(0, 30) + '...'
                                  : click.userAgent
                                : 'متصفح غير معروف'}
                            </span>
                            <span className="font-mono text-slate-400 dark:text-slate-500">
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
