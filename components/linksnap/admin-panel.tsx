'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  BarChart3,
  Link2,
  AlertTriangle,
  RefreshCw,
  Lock,
  Unlock,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AdminSkeleton } from '@/components/linksnap/loading-skeletons';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { getBaseUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useAnimatedCounter } from '@/domains/linksnap/hooks/use-animated-counter';
import { toast } from 'sonner';

interface AdminStats {
  totalLinks: number;
  totalClicks: number;
  blockedLinksCount: number;
  systemLinks: {
    code: string;
    originalUrl: string;
    createdAt: string;
    userId: string | null;
    isBlocked: boolean;
    clickCount: number;
  }[];
}

interface AdminPanelProps {
  token: string;
}

const PAGE_SIZE = 25;

export function AdminPanel({ token }: AdminPanelProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);
  const [moderateError, setModerateError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [blockConfirm, setBlockConfirm] = useState<{ code: string; isBlocked: boolean } | null>(
    null
  );

  const fetchAdminStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/linksnap/api/admin/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تم رفض الوصول أو فشل تحميل إحصائيات الإدارة.');
      }

      setStats(data.stats);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'فشل في جلب البيانات الإدارية.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAdminStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAdminStats]);

  const filteredLinks = useMemo(() => {
    if (!stats) return [];
    if (!searchQuery.trim()) return stats.systemLinks || [];
    const q = searchQuery.toLowerCase();
    return (stats.systemLinks || []).filter(
      (l) => l.code.toLowerCase().includes(q) || l.originalUrl.toLowerCase().includes(q)
    );
  }, [stats, searchQuery]);

  const animatedTotalLinks = useAnimatedCounter(stats?.totalLinks ?? 0);
  const animatedTotalClicks = useAnimatedCounter(stats?.totalClicks ?? 0);
  const animatedBlockedCount = useAnimatedCounter(stats?.blockedLinksCount ?? 0);

  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / PAGE_SIZE));
  const paginatedLinks = filteredLinks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(0);
  };

  const toggleModerationBlock = async (code: string, currentBlockedState: boolean) => {
    setActionLoadingCode(code);
    setModerateError(null);
    try {
      const targetState = !currentBlockedState;
      const res = await fetch('/linksnap/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, isBlocked: targetState }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل في مراقبة الرابط المختصر.');
      }

      if (stats) {
        const updatedLinks = (stats.systemLinks || []).map((link) => {
          if (link.code === code) {
            return { ...link, isBlocked: targetState };
          }
          return link;
        });

        const blockedDiff = targetState ? 1 : -1;

        setStats({
          ...stats,
          blockedLinksCount: stats.blockedLinksCount + blockedDiff,
          systemLinks: updatedLinks,
        });
        toast.success(targetState ? 'تم حظر الرابط بنجاح' : 'تم إلغاء حظر الرابط بنجاح');
      }
    } catch (err: unknown) {
      setModerateError(err instanceof Error ? err.message : 'حدث خطأ أثناء إجراء المراقبة.');
    } finally {
      setActionLoadingCode(null);
    }
  };

  if (loading && !stats) {
    return <AdminSkeleton />;
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-800 rounded-3xl text-center max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            الوصول الأمني الإداري
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{error}</p>
        </div>
        <button
          onClick={fetchAdminStats}
          className="px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-medium text-xs rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer focus-ring"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة محاولة التحقق</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600 stroke-[2.5]" />
            <span>لوحة الإدارة</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-500 font-semibold mt-0.5">
            مؤشرات صحة النظام والمراقبة الآلية للمحتوى
          </p>
        </div>
        <button
          onClick={fetchAdminStats}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-semibold text-xs rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer focus-ring"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            role={loading ? 'status' : undefined}
          />
          <span>إعادة تحميل المقاييس</span>
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-100/30 dark:shadow-slate-900/30 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shrink-0">
              <Link2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider block">
                الروابط النشطة العالمية
              </span>
              <span
                className="text-3xl font-black text-slate-800 dark:text-slate-100 font-display mt-0.5 block"
                aria-live="polite"
                aria-label={`${stats.totalLinks} رابط نشط`}
              >
                {animatedTotalLinks}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-100/30 dark:shadow-slate-900/30 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider block">
                النقرات على مستوى النظام
              </span>
              <span
                className="text-3xl font-black text-slate-800 dark:text-slate-100 font-display mt-0.5 block"
                aria-live="polite"
                aria-label={`${stats.totalClicks} نقرة`}
              >
                {animatedTotalClicks}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-100/30 dark:shadow-slate-900/30 flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider block">
                الروابط الضارة المحظورة
              </span>
              <span
                className="text-3xl font-black text-red-600 font-display mt-0.5 block"
                aria-live="polite"
                aria-label={`${stats.blockedLinksCount} رابط محظور`}
              >
                {animatedBlockedCount}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-100/30 dark:shadow-slate-900/30 overflow-hidden">
        {moderateError && (
          <div
            aria-live="polite"
            className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{moderateError}</span>
            <button
              onClick={() => setModerateError(null)}
              aria-label="إغلاق"
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors cursor-pointer focus-ring"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="p-6 border-b border-slate-50 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              دليل الروابط المختصرة الكامل
            </h3>
            <Badge variant="outline">مزامنة قاعدة البيانات المباشرة</Badge>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="admin-search"
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="بحث بالرمز أو الرابط..."
              aria-label="بحث بالرمز أو الرابط"
              className="w-full pr-9 pl-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-slate-200 placeholder:text-slate-500 transition-all"
            />
          </div>
        </div>

        {stats && (!filteredLinks || filteredLinks.length === 0) ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs font-semibold">
            {searchQuery ? 'لا توجد نتائج تطابق بحثك.' : 'لا توجد روابط مختصرة متاحة في الدليل.'}
          </div>
        ) : stats ? (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-700">
                    <th scope="col" className="px-6 py-4 text-right">
                      الرمز
                    </th>
                    <th scope="col" className="px-6 py-4 text-right">
                      الوجهة المستهدفة
                    </th>
                    <th scope="col" className="px-6 py-4 text-center">
                      النقرات
                    </th>
                    <th scope="col" className="px-6 py-4 text-center">
                      الحالة الأمنية
                    </th>
                    <th scope="col" className="px-6 py-4 text-left">
                      إجراءات المراقبة
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedLinks.map((link) => {
                    const fullUrl = `${getBaseUrl()}/${link.code}`;
                    const isModding = actionLoadingCode === link.code;

                    return (
                      <tr
                        key={link.code}
                        className="hover:bg-slate-50/20 dark:hover:bg-slate-700/20"
                      >
                        <td className="px-6 py-4 font-mono font-bold text-indigo-600">
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            /{link.code}
                          </a>
                        </td>
                        <td
                          className="px-6 py-4 max-w-[220px] md:max-w-xs truncate text-slate-500 dark:text-slate-400 font-mono"
                          title={link.originalUrl}
                        >
                          {link.originalUrl}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-700 dark:text-slate-300">
                          {link.clickCount}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {link.isBlocked ? (
                            <Badge variant="destructive">محظور</Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700"
                            >
                              آمن
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() =>
                              setBlockConfirm({ code: link.code, isBlocked: link.isBlocked })
                            }
                            disabled={isModding}
                            className={`px-3 py-2 font-bold text-xs rounded-lg border transition-all inline-flex items-center gap-1 cursor-pointer focus-ring ${
                              link.isBlocked
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-800/40'
                                : 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-800/40 border-red-100 dark:border-red-700 text-red-600 dark:text-red-400'
                            }`}
                          >
                            {isModding ? (
                              <div
                                className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                                role="status"
                              />
                            ) : link.isBlocked ? (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>إلغاء حظر الرابط</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>حظر الرابط</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {paginatedLinks.map((link) => {
                const fullUrl = `${getBaseUrl()}/${link.code}`;
                const isModding = actionLoadingCode === link.code;

                return (
                  <div key={link.code} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-bold text-indigo-600 hover:underline text-sm"
                      >
                        /{link.code}
                      </a>
                      {link.isBlocked ? (
                        <Badge variant="destructive">محظور</Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700"
                        >
                          آمن
                        </Badge>
                      )}
                    </div>
                    <p
                      className="text-xs text-slate-500 dark:text-slate-400 font-mono line-clamp-1"
                      title={link.originalUrl}
                    >
                      {link.originalUrl}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                        {link.clickCount} نقرة
                      </span>
                      <button
                        onClick={() =>
                          setBlockConfirm({ code: link.code, isBlocked: link.isBlocked })
                        }
                        disabled={isModding}
                        className={`px-3 py-1.5 font-bold text-xs rounded-lg border transition-all inline-flex items-center gap-1 cursor-pointer focus-ring ${
                          link.isBlocked
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-800/40'
                            : 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-800/40 border-red-100 dark:border-red-700 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isModding ? (
                          <div
                            className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                            role="status"
                          />
                        ) : link.isBlocked ? (
                          <>
                            <Unlock className="w-3 h-3" />
                            <span>إلغاء حظر</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            <span>حظر</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-700">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  الصفحة {page + 1} من {totalPages} ({filteredLinks.length} نتيجة)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus-ring"
                    aria-label="الصفحة السابقة"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                    if (pageNum >= totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-9 h-9 text-xs font-bold rounded-lg transition-colors cursor-pointer focus-ring ${
                          pageNum === page
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus-ring"
                    aria-label="الصفحة التالية"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!blockConfirm}
        title={blockConfirm?.isBlocked ? 'إلغاء حظر الرابط' : 'حظر الرابط'}
        message={
          blockConfirm?.isBlocked
            ? 'هل أنت متأكد من إلغاء حظر هذا الرابط؟ سيصبح متاحًا للمستخدمين مرة أخرى.'
            : 'هل أنت متأكد من حظر هذا الرابط؟ لن يتمكن المستخدمون من الوصول إليه بعد الآن.'
        }
        confirmLabel={blockConfirm?.isBlocked ? 'إلغاء الحظر' : 'حظر الرابط'}
        cancelLabel="إلغاء"
        variant={blockConfirm?.isBlocked ? 'default' : 'danger'}
        onConfirm={() => {
          if (blockConfirm) {
            toggleModerationBlock(blockConfirm.code, blockConfirm.isBlocked);
            setBlockConfirm(null);
          }
        }}
        onCancel={() => setBlockConfirm(null)}
      />
    </div>
  );
}
