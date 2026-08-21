'use client';

import { useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import {
  Link2,
  RefreshCw,
  AlertTriangle,
  Check,
  Copy,
  Trash2,
  Calendar,
  Loader2,
} from 'lucide-react';
import { LinkRowCard } from './link-row-card';
import { shorten } from '@/frontend/api/linksnap';
import { DashboardEmptyState } from './dashboard-empty-state';
import { DashboardSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { useLinks } from '@/frontend/state/linksnap/use-links';
import { useBulkLinks } from '@/frontend/state/linksnap/use-bulk-links';
import { getBaseUrl } from '@/frontend/shared/get-base-url';
import { toast } from 'sonner';

interface LinkDashboardProps {
  token: string;
  refreshTrigger: number;
}

export function LinkDashboard({ token, refreshTrigger }: LinkDashboardProps) {
  const reducedMotion = useReducedMotion();
  const { links, loading, error, fetchLinks, handleDelete, applyLinkUpdate } = useLinks(
    token,
    refreshTrigger
  );

  const codes = links.map((link) => link.code);
  const bulk = useBulkLinks(codes, token);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    setShowDeleteConfirm(false);
    const deletedLinks = links.filter((l) => bulk.selectedCodes.includes(l.code));
    const result = await bulk.runDelete();
    if (result) {
      toast('تم حذف الروابط المحددة', {
        action: {
          label: 'تراجع',
          onClick: async () => {
            try {
              for (const link of deletedLinks) {
                await shorten(link.originalUrl, link.code, token);
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
    }
  };

  const showBar = links.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Link2 aria-hidden="true" className="w-5 h-5 text-primary" />
          <span>روابطك المختصرة</span>
        </h2>
        <button
          onClick={fetchLinks}
          disabled={loading}
          aria-label="تحديث القائمة"
          className="p-2 text-muted-foreground hover:text-primary rounded-full hover:bg-muted transition-colors cursor-pointer press-scale focus-ring touch-target btn-press"
          title="تحديث القائمة"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            role={loading ? 'status' : undefined}
          />
        </button>
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
          onOpenDelete={() => setShowDeleteConfirm(true)}
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
            className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive font-semibold text-xs rounded-full transition-colors cursor-pointer btn-press shrink-0 focus-ring touch-target"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : links.length === 0 ? (
        <DashboardEmptyState />
      ) : (
        <m.div
          initial={reducedMotion ? 'visible' : 'hidden'}
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.06 } },
          }}
          className="space-y-4"
        >
          {links.map((link) => (
            <m.div
              key={link.code}
              variants={{
                hidden: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <LinkRowCard
                code={link.code}
                originalUrl={link.originalUrl}
                createdAt={link.createdAt}
                expiresAt={link.expiresAt}
                status={link.status}
                passwordProtected={link.passwordProtected}
                token={token}
                onDeleted={handleDelete}
                onUpdated={(prevCode, link) => applyLinkUpdate(prevCode, link)}
                onRestored={fetchLinks}
                isSelected={bulk.selected.has(link.code)}
                onToggleSelect={bulk.toggle}
              />
            </m.div>
          ))}
        </m.div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="حذف روابط مختارة"
        message={`هل أنت متأكد من حذف ${bulk.selectedCount} روابط؟ هذا الإجراء دائم.`}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        icon={Trash2}
        variant="danger"
        onConfirm={deleteSelected}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

interface BulkActionBarProps {
  allSelected: boolean;
  total: number;
  selectedCount: number;
  onToggleAll: () => void;
  onClear: () => void;
  onCopyAll: () => void;
  onOpenExpiry: () => void;
  expiryOpen: boolean;
  expiryDate: string;
  onExpiryDateChange: (value: string) => void;
  onApplyExpiry: () => void;
  onOpenDelete: () => void;
  busy: boolean;
}

function BulkActionBar({
  allSelected,
  total,
  selectedCount,
  onToggleAll,
  onClear,
  onCopyAll,
  onOpenExpiry,
  expiryOpen,
  expiryDate,
  onExpiryDateChange,
  onApplyExpiry,
  onOpenDelete,
  busy,
}: BulkActionBarProps) {
  return (
    <div className="sticky top-3 z-20 bg-card/90 backdrop-blur border border-border rounded-xl p-3 shadow-sm flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onToggleAll}
        aria-pressed={allSelected}
        className="inline-flex items-center gap-2 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer focus-ring touch-target p-1 rounded-md"
      >
        <span
          className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-colors ${
            allSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-muted-foreground/40'
          }`}
        >
          <Check aria-hidden="true" className="w-3 h-3" strokeWidth={3} />
        </span>
        تحديد الكل
      </button>

      <span className="text-xs text-muted-foreground">
        {selectedCount > 0 ? `${selectedCount} من ${total}` : `إجمالي ${total}`}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onClear}
        disabled={selectedCount === 0 || busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
      >
        مسح
      </button>

      <button
        type="button"
        onClick={onCopyAll}
        disabled={selectedCount === 0 || busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
      >
        <Copy aria-hidden="true" className="w-3.5 h-3.5" />
        نسخ الروابط
      </button>

      <button
        type="button"
        onClick={onOpenExpiry}
        disabled={selectedCount === 0 || busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
      >
        <Calendar aria-hidden="true" className="w-3.5 h-3.5" />
        انتهاء
      </button>

      {expiryOpen ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => onExpiryDateChange(e.target.value)}
            aria-label="تاريخ انتهاء الصلاحية"
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-ring touch-target"
          />
          <button
            type="button"
            onClick={onApplyExpiry}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press"
          >
            {busy ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" /> : 'تطبيق'}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onOpenDelete}
        disabled={selectedCount === 0 || busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed btn-press focus-ring"
      >
        <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
        حذف
      </button>
    </div>
  );
}
