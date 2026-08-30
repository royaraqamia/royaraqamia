'use client';

import { useState, useMemo } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { AdminSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { AdminStatsCards } from './admin-stats-cards';
import { AdminErrorState } from './admin-error-state';
import { AdminLinksDirectory } from './admin-links-directory';
import { useAdminLinks } from '@/frontend/state/linksnap/use-admin';

interface AdminPanelProps {
  token: string;
}

const PAGE_SIZE = 25;

export function AdminPanel({ token }: AdminPanelProps) {
  const {
    stats,
    loading,
    error,
    fetchAdminStats,
    toggleModerationBlock,
    actionLoadingCode,
    moderateError,
    setModerateError,
  } = useAdminLinks(token);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [blockConfirm, setBlockConfirm] = useState<{ code: string; isBlocked: boolean } | null>(
    null
  );

  const filteredLinks = useMemo(() => {
    if (!stats) return [];
    if (!searchQuery.trim()) return stats.links || [];
    const q = searchQuery.toLowerCase();
    return (stats.links || []).filter(
      (l) => l.code.toLowerCase().includes(q) || l.originalUrl.toLowerCase().includes(q)
    );
  }, [stats, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / PAGE_SIZE));

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
          <p className="text-xs text-muted-foreground font-bold mt-0.5">
            مؤشرات صحة النظام والمراقبة الآلية للمحتوى
          </p>
        </div>
        <button
          onClick={fetchAdminStats}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2 bg-muted/50 hover:bg-muted text-muted-foreground border border-border font-bold text-xs rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer focus-ring touch-target btn-press"
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
