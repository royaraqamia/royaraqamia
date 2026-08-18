'use client';

import { useState } from 'react';
import {
  Copy,
  Check,
  Pencil,
  BarChart3,
  Trash2,
  ChevronUp,
  ChevronDown,
  Calendar,
  AlertTriangle,
  QrCode,
  MoreHorizontal,
  ExternalLink,
  Share2,
} from 'lucide-react';
import { logger } from '@/frontend/shared/logger';
import { LinkEditDialog } from './link-edit-dialog';
import { LinkAnalyticsDrawer } from './link-analytics-drawer';
import { LinkQrModal } from './link-qr-modal';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import { cn } from '@/frontend/shared/cn';
import { getBaseUrl } from '@/frontend/shared/get-base-url';
import { toast } from 'sonner';
import { useDeleteLink } from '@/frontend/state/linksnap/use-links';
import { useLinkAnalytics } from '@/frontend/state/linksnap/use-analytics';
import type { LinkStatus } from '@/shared/contracts/linksnap';
import type { ShortenedLink } from '@/frontend/api/linksnap';

const STATUS_META: Record<LinkStatus, { label: string; className: string; dotClass: string }> = {
  active: {
    label: 'نشط',
    className:
      'text-emerald-700 bg-emerald-50/80 border-emerald-200/60 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800/50',
    dotClass: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]',
  },
  expired: {
    label: 'منتهي الصلاحية',
    className:
      'text-neutral-600 bg-neutral-100/80 border-neutral-200/60 dark:text-neutral-400 dark:bg-neutral-800/60 dark:border-neutral-700/50',
    dotClass: 'bg-neutral-400 dark:bg-neutral-500',
  },
  blocked: {
    label: 'محظور',
    className:
      'text-rose-700 bg-rose-50/80 border-rose-200/60 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-800/50',
    dotClass: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]',
  },
};

interface LinkRowCardProps {
  code: string;
  originalUrl: string;
  createdAt: string;
  expiresAt: string | null;
  status: LinkStatus;
  token: string;
  onDeleted: (code: string) => void;
  onUpdated: (prevCode: string, link: ShortenedLink) => void;
  isSelected?: boolean;
  onToggleSelect?: (code: string) => void;
}

export function LinkRowCard({
  code,
  originalUrl,
  createdAt,
  expiresAt,
  status,
  token,
  onDeleted,
  onUpdated,
  isSelected = false,
  onToggleSelect,
}: LinkRowCardProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const { deleteLink, deleteError } = useDeleteLink(token);
  const {
    analytics,
    analyticsLoading,
    analyticsError,
    exportingCsv,
    exportCsvError,
    loadAnalytics,
    exportCsv,
    resetAnalytics,
  } = useLinkAnalytics(code, token);

  const fullShortUrl = `${getBaseUrl()}/${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullShortUrl);
      setCopiedCode(code);
      toast.success('تم نسخ الرابط!');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      logger.error('Copy failed', { error: String(err) });
      toast.error('فشل نسخ الرابط');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'رابط مُختصَر من LinkSnap', url: fullShortUrl });
        toast.success('تمت المشاركة!');
      } else {
        await handleCopy();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.error('Share failed', { error: String(err) });
      toast.error('تعذر فتح لوحة المشاركة');
    }
  };

  const handleDeleteConfirmed = async () => {
    setShowDeleteConfirm(false);

    try {
      await deleteLink(code);
      onDeleted(code);
      toast.success('تم حذف الرابط بنجاح');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في حذف الرَّابط.';
      toast.error(msg);
    }
  };

  const handleAnalyticsToggle = () => {
    if (isExpanded) {
      setIsExpanded(false);
      resetAnalytics();
      return;
    }
    setIsExpanded(true);
  };

  return (
    <article
      className={cn(
        'group relative flex w-full flex-col rounded-2xl bg-white transition-all duration-300 ease-out dark:bg-neutral-950',
        'border border-neutral-200/80 dark:border-neutral-800/80',
        'shadow-xs hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-lg hover:shadow-neutral-900/5 dark:hover:border-neutral-700 dark:hover:shadow-black/40',
        isSelected &&
          'border-neutral-900 ring-2 ring-neutral-900/10 dark:border-neutral-100 dark:ring-neutral-100/10'
      )}
    >
      <div className="flex flex-col gap-3.5 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
        {/* Checkbox & Details Section */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {onToggleSelect ? (
            <button
              type="button"
              onClick={() => onToggleSelect(code)}
              aria-pressed={isSelected}
              aria-label={isSelected ? 'إلغاء تحديد الرابط' : 'تحديد الرابط'}
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 ease-out',
                'active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
                isSelected
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300/90 bg-neutral-50/50 text-transparent hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/40 dark:hover:border-neutral-500'
              )}
            >
              <Check aria-hidden="true" className="h-3.5 w-3.5 stroke-3" />
            </button>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* Top Row: Short Slug Code + Status + Date Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.open(fullShortUrl, '_blank')}
                className={cn(
                  'group/code inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 bg-neutral-100/70 px-2.5 py-1 font-mono text-sm font-semibold tracking-tight text-neutral-900 transition-all duration-200',
                  'hover:border-blue-500/40 hover:bg-blue-50/50 hover:text-blue-600 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-100 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/30 dark:hover:text-blue-400',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950'
                )}
                title={`فتح ${fullShortUrl}`}
              >
                <span>/{code}</span>
                <ExternalLink
                  aria-hidden="true"
                  className="h-3 w-3 opacity-40 transition-opacity duration-200 group-hover/code:opacity-100"
                />
              </button>

              {/* Status Badge */}
              {(() => {
                const meta = STATUS_META[status] ?? STATUS_META.active;
                return (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur-md transition-all duration-200',
                      meta.className
                    )}
                    title={expiresAt ? `ينتهي في ${expiresAt}` : undefined}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        meta.dotClass,
                        status === 'active' && 'animate-pulse'
                      )}
                    />
                    {meta.label}
                  </span>
                );
              })()}

              {/* Date Badge */}
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200/70 bg-neutral-50/80 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400">
                <Calendar
                  aria-hidden="true"
                  className="h-3 w-3 text-neutral-400 dark:text-neutral-500"
                />
                {new Intl.DateTimeFormat('ar-SA', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  calendar: 'islamic-umalqura',
                  numberingSystem: 'latn',
                }).format(new Date(createdAt))}
              </span>
            </div>

            {/* Target Destination URL */}
            <p
              className="truncate text-[13px] leading-relaxed text-neutral-500 transition-colors duration-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              title={originalUrl}
            >
              {originalUrl}
            </p>
          </div>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 pt-2 sm:border-t-0 sm:pt-0 dark:border-neutral-800/60">
          <button
            onClick={handleCopy}
            type="button"
            aria-label="نسخ الرابط"
            title="نسخ الرابط"
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-600 transition-all duration-200 ease-out',
              'hover:scale-[1.03] hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
              'dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
              copiedCode === code &&
                'border-emerald-500/50 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-400'
            )}
          >
            {copiedCode === code ? (
              <Check
                aria-hidden="true"
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              />
            ) : (
              <Copy aria-hidden="true" className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={handleShare}
            type="button"
            aria-label="مشاركة الرابط"
            title="مشاركة الرابط"
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-600 transition-all duration-200 ease-out',
              'hover:scale-[1.03] hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
              'dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
            )}
          >
            <Share2 aria-hidden="true" className="h-4 w-4" />
          </button>

          <button
            onClick={handleAnalyticsToggle}
            type="button"
            aria-expanded={isExpanded}
            aria-controls={`analytics-panel-${code}`}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition-all duration-200 ease-out',
              'hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
              isExpanded
                ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                : 'border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
            )}
          >
            <BarChart3 aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">التَّحليلات</span>
            {isExpanded ? (
              <ChevronUp
                aria-hidden="true"
                className="ms-0.5 h-3.5 w-3.5 transition-transform duration-200"
              />
            ) : (
              <ChevronDown
                aria-hidden="true"
                className="ms-0.5 h-3.5 w-3.5 transition-transform duration-200"
              />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`إجراءات الرابط /${code}`}
                title="مزيد من الإجراءات"
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-600 transition-all duration-200 ease-out',
                  'hover:scale-[1.03] hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
                  'dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                )}
              >
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 font-medium">
              <DropdownMenuItem onClick={() => setEditingCode(code)} className="cursor-pointer">
                <Pencil className="me-2 h-4 w-4" />
                <span>تعديل الرَّابط</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowQr(true)} className="cursor-pointer">
                <QrCode className="me-2 h-4 w-4" />
                <span>رمز الـ QR</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 border-neutral-100 dark:border-neutral-800" />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                className="cursor-pointer text-rose-600 focus:bg-rose-50 dark:text-rose-400 dark:focus:bg-rose-950/40"
              >
                <Trash2 className="me-2 h-4 w-4" />
                <span>حذف الرَّابط</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete Error Notification */}
      {deleteError && (
        <div
          role="alert"
          aria-live="polite"
          className="mx-4 mb-4 flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/70 p-3 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertTriangle
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400"
          />
          <span>{deleteError}</span>
        </div>
      )}

      {/* Embedded Drawer & Dialog Components */}
      <div id={`analytics-panel-${code}`}>
        <LinkAnalyticsDrawer
          isExpanded={isExpanded}
          analyticsLoading={analyticsLoading}
          analyticsError={analyticsError}
          analytics={analytics}
          status={status}
          loadAnalytics={loadAnalytics}
          exportCsv={exportCsv}
          exportingCsv={exportingCsv}
          exportCsvError={exportCsvError}
          code={code}
        />
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="حذف الرابط"
        message="هل أنت متأكد من حذف هذا الرَّابط المُختصَر؟ هذا الإجراء دائم."
        confirmLabel="حذف الرابط"
        cancelLabel="إلغاء"
        icon={Trash2}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <LinkQrModal code={code} baseUrl={getBaseUrl()} open={showQr} onOpenChange={setShowQr} />

      <LinkEditDialog
        open={editingCode === code}
        code={code}
        currentUrl={originalUrl}
        currentExpiresAt={expiresAt}
        token={token}
        onSaved={(link) => {
          onUpdated(code, link);
          setEditingCode(null);
        }}
        onClose={() => setEditingCode(null)}
      />
    </article>
  );
}
