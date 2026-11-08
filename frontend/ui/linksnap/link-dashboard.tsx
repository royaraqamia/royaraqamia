'use client';

import { useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { LinkRowCard } from './link-row-card';
import { BulkActionBar } from './bulk-action-bar';
import { shorten } from '@/frontend/api/linksnap';
import { DashboardEmptyState } from './dashboard-empty-state';
import { DashboardSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { useLinks } from '@/frontend/state/linksnap/use-links';
import { useBulkLinks } from '@/frontend/state/linksnap/use-bulk-links';
import { useLinksnapContext } from '@/frontend/state/linksnap/linksnap-context';
import { LinksnapSyncStatus } from '@/frontend/ui/linksnap/linksnap-sync-status';
import { getBaseUrl } from '@/frontend/shared/get-base-url';
import { toast } from 'sonner';

interface LinkDashboardProps {
  token: string;
  refreshTrigger: number;
}

export function LinkDashboard({ token, refreshTrigger }: LinkDashboardProps) {
  const reducedMotion = useReducedMotion();
  const linksnap = useLinksnapContext();
  const { links, loading, error, fetchLinks, handleDelete, applyLinkUpdate } = useLinks(
    token,
    refreshTrigger
  );

  const codes = links.map((link) => link.code);
  const bulk = useBulkLinks(codes, token);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');

  const copySelectedUrls = async () => {
    const base = getBaseUrl();
    const urls = bulk.selectedCodes.map((code) => `${base}/${code}`);
    try {
      await navigator.clipboard.writeText(urls.join('\n'));
      toast.success('تم نسخ الروابط المحددة!');
    } catch {
      toast.error('فشل نسخ الروابط');
    }
  };

  const applyExpiry = async () => {
    if (!expiryDate) {
      toast.error('اختر تاريخ انتهاء الصلاحية');
      return;
    }
    const ok = await bulk.runSetExpiry(new Date(expiryDate).toISOString());
    if (ok) {
      toast.success('تم تعيين تاريخ الانتهاء');
      setExpiryOpen(false);
      setExpiryDate('');
      await fetchLinks();
    }
  };

  const deleteSelected = async () => {
    const deletedLinks = links.filter((l) => bulk.selectedCodes.includes(l.code));
    const result = await bulk.runDelete();
    if (!result) return;
    if (result.deleted === 0) {
      toast.error('لم يتم العثور على الروابط المحددة.');
      return;
    }
    toast('تم حذف الروابط المحددة', {
      action: {
        label: 'تراجع',
        onClick: async () => {
          try {
            for (const link of deletedLinks) {
              // Undo resurrects the same row, which the Local Store path can do
              // by identity; the legacy network path has no restore endpoint, so
              // it re-creates the link the way the single-row card does.
              if (linksnap) {
                if (link.clientId) await linksnap.restoreLink(link.clientId);
              } else {
                await shorten(link.originalUrl, link.code, token);
              }
            }
            await fetchLinks();
            toast.success('تم استرجاع الروابط');
          } catch {
            toast.error('فشل استرجاع الروابط');
          }
        },
      },
    });
    await fetchLinks();
  };

  const showBar = links.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <LinksnapSyncStatus />
      </div>

      {showBar ? (
        <BulkActionBar
          allSelected={bulk.allSelected}
          total={links.length}
          selectedCount={bulk.selectedCount}
          onToggleAll={bulk.toggleAll}
          onClear={bulk.clear}
          onCopyAll={copySelectedUrls}
          onOpenExpiry={() => setExpiryOpen((v) => !v)}
          expiryOpen={expiryOpen}
          expiryDate={expiryDate}
          onExpiryDateChange={setExpiryDate}
          onApplyExpiry={applyExpiry}
          onDelete={deleteSelected}
          busy={bulk.busy}
        />
      ) : null}

      {bulk.error ? (
        <div
          aria-live="polite"
          className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg flex items-center gap-1.5"
        >
          <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" />
          <span>{bulk.error}</span>
        </div>
      ) : null}

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div
          aria-live="polite"
          className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl flex items-center gap-2"
        >
          <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={fetchLinks}
            className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive font-bold text-xs rounded-full transition-colors cursor-pointer btn-press shrink-0 focus-ring touch-target"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : links.length === 0 ? (
        <DashboardEmptyState />
      ) : (
        <m.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.06 } },
          }}
          className="space-y-4"
        >
          {links.map((link) => (
            <m.div
              key={link.clientId ?? link.code}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <LinkRowCard
                clientId={link.clientId ?? link.code}
                code={link.code}
                originalUrl={link.originalUrl}
                createdAt={link.createdAt}
                expiresAt={link.expiresAt}
                status={link.status}
                passwordProtected={link.passwordProtected}
                token={token}
                onDeleted={handleDelete}
                onUpdated={(key, updated) => applyLinkUpdate(key, updated)}
                onRestored={fetchLinks}
                isSelected={bulk.selected.has(link.code)}
                onToggleSelect={bulk.toggle}
              />
            </m.div>
          ))}
        </m.div>
      )}
    </div>
  );
}
