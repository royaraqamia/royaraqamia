'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { AdminSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { toast } from 'sonner';
import { AdminStatsCards } from './admin-stats-cards';
import { AdminErrorState } from './admin-error-state';
import { AdminLinksDirectory, type AdminSystemLink } from './admin-links-directory';

interface AdminStats {
  totalLinks: number;
  totalClicks: number;
  blockedLinksCount: number;
  systemLinks: AdminSystemLink[];
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

  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / PAGE_SIZE));

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
    return <AdminErrorState error={error} onRetry={fetchAdminStats} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-black text-foreground tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary stroke-[2.5]" />
            <span>لوحة الإدارة</span>
          </h2>
          <p className="text-xs text-muted-foreground font-semibold mt-0.5">
            مؤشرات صحة النظام والمراقبة الآلية للمحتوى
          </p>
        </div>
        <button
          onClick={fetchAdminStats}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2 bg-muted/50 hover:bg-muted text-muted-foreground border border-border font-semibold text-xs rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer focus-ring touch-target btn-press"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            role={loading ? 'status' : undefined}
          />
          <span>إعادة تحميل المقاييس</span>
        </button>
      </div>

      {stats && (
        <AdminStatsCards
          totalLinks={stats.totalLinks}
          totalClicks={stats.totalClicks}
          blockedLinksCount={stats.blockedLinksCount}
        />
      )}

      <AdminLinksDirectory
        links={filteredLinks}
        searchQuery={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          setPage(0);
        }}
        page={page}
        totalPages={totalPages}
        actionLoadingCode={actionLoadingCode}
        moderateError={moderateError}
        onDismissModerateError={() => setModerateError(null)}
        onRequestBlock={(code, isBlocked) => setBlockConfirm({ code, isBlocked })}
        onPageChange={setPage}
      />

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
