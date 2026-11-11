'use client';

import { useState, memo } from 'react';
import {
  Copy,
  Check,
  Pencil,
  ChartColumn,
  Trash,
  ChevronUp,
  ChevronDown,
  TriangleAlert,
  QrCode,
  Ellipsis,
  Share2,
} from 'lucide-react';
import { logger } from '@/frontend/shared/logger';
import { LinkRowSummary } from './link-row-summary';
import { LinkEditDialog } from './link-edit-dialog';
import { LinkAnalyticsDrawer } from './link-analytics-drawer';
import { LinkQrModal } from './link-qr-modal';
import { LINK_ROW_CARD_COPY } from './link-row-card-copy';
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
import { shorten, type ShortenedLink } from '@/frontend/api/linksnap';
import { toast } from 'sonner';
import { useDeleteLink } from '@/frontend/state/linksnap/use-links';
import { useLinksnapContext } from '@/frontend/state/linksnap/linksnap-context';
import { useLinkAnalytics } from '@/frontend/state/linksnap/use-analytics';
import type { LinkStatus } from '@/shared/contracts/linksnap';

interface LinkRowCardProps {
  clientId: string;
  code: string;
  originalUrl: string;
  createdAt: string;
  expiresAt: string | null;
  status: LinkStatus;
  passwordProtected?: boolean;
  token: string;
  onDeleted: (clientId: string) => void;
  onUpdated: (clientId: string, link: ShortenedLink) => void;
  onRestored?: () => void;
  isSelected?: boolean;
  onToggleSelect?: (code: string) => void;
}

export const LinkRowCard = memo(function LinkRowCard({
  clientId,
  code,
  originalUrl,
  createdAt,
  expiresAt,
  status,
  passwordProtected = false,
  token,
  onDeleted,
  onUpdated,
  onRestored,
  isSelected = false,
  onToggleSelect,
}: LinkRowCardProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const linksnap = useLinksnapContext();
  const { deleteLink, deleteError } = useDeleteLink(token);
  const {
    analytics,
    analyticsLoading,
    analyticsError,
    exportingCsv,
    exportCsvFailed,
    loadAnalytics,
    exportCsv,
    resetAnalytics,
  } = useLinkAnalytics(code, token);

  const fullShortUrl = `${getBaseUrl()}/${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullShortUrl);
      setCopiedCode(code);
      toast.success(LINK_ROW_CARD_COPY.copyDone);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      logger.error('Copy failed', { error: String(err) });
      toast.error(LINK_ROW_CARD_COPY.copyFailed);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: LINK_ROW_CARD_COPY.shareTitle, url: fullShortUrl });
        toast.success(LINK_ROW_CARD_COPY.shareDone);
      } else {
        await handleCopy();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.error('Share failed', { error: String(err) });
      toast.error(LINK_ROW_CARD_COPY.shareFailed);
    }
  };

  const handleDeleteConfirmed = async () => {
    setShowDeleteConfirm(false);

    try {
      await deleteLink(clientId);
      onDeleted(clientId);
      toast(LINK_ROW_CARD_COPY.deleted, {
        action: {
          label: LINK_ROW_CARD_COPY.undo,
          onClick: async () => {
            try {
              if (linksnap) {
                await linksnap.restoreLink(clientId);
              } else {
                await shorten(originalUrl, code, token);
              }
              onRestored?.();
              toast.success(LINK_ROW_CARD_COPY.restored);
            } catch {
              toast.error(LINK_ROW_CARD_COPY.restoreFailed);
            }
          },
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : LINK_ROW_CARD_COPY.deleteFailed;
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
        'group relative flex w-full flex-col rounded-2xl bg-white transition-safe duration-300 ease-out dark:bg-neutral-950',
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
              aria-label={isSelected ? 'إلغاء تحديد الرَّابط' : 'تحديد الرَّابط'}
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-safe duration-200 ease-out',
                'active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
                isSelected
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                  : 'border-neutral-300/90 bg-neutral-50/50 text-transparent hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/40 dark:hover:border-neutral-500'
              )}
            >
              <Check aria-hidden="true" className="h-3.5 w-3.5 stroke-3" />
            </button>
          ) : null}

          <LinkRowSummary
            code={code}
            originalUrl={originalUrl}
            createdAt={createdAt}
            status={status}
            expiresAt={expiresAt}
            passwordProtected={passwordProtected}
            onOpen={() => window.open(fullShortUrl, '_blank')}
          />
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 pt-2 sm:border-t-0 sm:pt-0 dark:border-neutral-800/60">
          <button
            onClick={handleCopy}
            type="button"
            aria-label={LINK_ROW_CARD_COPY.copyAction}
            title={LINK_ROW_CARD_COPY.copyAction}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-600 transition-safe duration-200 ease-out',
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
            aria-label={LINK_ROW_CARD_COPY.shareAction}
            title={LINK_ROW_CARD_COPY.shareAction}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-600 transition-safe duration-200 ease-out',
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
            data-visual="link-row-analytics"
            aria-expanded={isExpanded}
            aria-controls={`analytics-panel-${code}`}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition-safe duration-200 ease-out',
              'hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
              isExpanded
                ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                : 'border-neutral-200/80 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
            )}
          >
            <ChartColumn aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{LINK_ROW_CARD_COPY.analyticsAction}</span>
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
                data-visual="link-row-more"
                aria-label={`${LINK_ROW_CARD_COPY.actionsMenu} /${code}`}
                title={LINK_ROW_CARD_COPY.moreActions}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200/80 bg-white text-neutral-600 transition-safe duration-200 ease-out',
                  'hover:scale-[1.03] hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950',
                  'dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                )}
              >
                <Ellipsis aria-hidden="true" className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 font-medium">
              <DropdownMenuItem
                data-visual="link-row-edit"
                onClick={() => setEditing(true)}
                className="cursor-pointer"
              >
                <Pencil className="me-2 h-4 w-4" />
                <span>{LINK_ROW_CARD_COPY.editAction}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                data-visual="link-row-qr"
                onClick={() => setShowQr(true)}
                className="cursor-pointer"
              >
                <QrCode className="me-2 h-4 w-4" />
                <span>{LINK_ROW_CARD_COPY.qrAction}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 border-neutral-100 dark:border-neutral-800" />
              <DropdownMenuItem
                data-visual="link-row-delete"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                className="cursor-pointer text-rose-600 focus:bg-rose-50 dark:text-rose-400 dark:focus:bg-rose-950/40"
              >
                <Trash className="me-2 h-4 w-4" />
                <span>{LINK_ROW_CARD_COPY.deleteAction}</span>
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
          <TriangleAlert
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
          exportCsvFailed={exportCsvFailed}
          code={code}
        />
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={LINK_ROW_CARD_COPY.deleteTitle}
        message={LINK_ROW_CARD_COPY.deleteMessage}
        confirmLabel={LINK_ROW_CARD_COPY.deleteConfirm}
        cancelLabel={LINK_ROW_CARD_COPY.deleteCancel}
        icon={Trash}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <LinkQrModal code={code} baseUrl={getBaseUrl()} open={showQr} onOpenChange={setShowQr} />

      <LinkEditDialog
        open={editing}
        clientId={clientId}
        code={code}
        currentUrl={originalUrl}
        currentExpiresAt={expiresAt}
        currentPasswordProtected={passwordProtected}
        token={token}
        onSaved={(link) => {
          onUpdated(clientId, link);
          setEditing(false);
        }}
        onClose={() => setEditing(false)}
      />
    </article>
  );
});
