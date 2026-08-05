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
} from 'lucide-react';
import { logger } from '@/frontend/shared/logger';
import { LinkEditForm } from './link-edit-form';
import { LinkAnalyticsDrawer } from './link-analytics-drawer';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { cn } from '@/frontend/shared/cn';
import { getBaseUrl } from '@/frontend/shared/get-base-url';
import { toast } from 'sonner';
import { useDeleteLink } from '@/frontend/state/linksnap/use-links';
import { useLinkAnalytics } from '@/frontend/state/linksnap/use-analytics';

interface LinkRowCardProps {
  code: string;
  originalUrl: string;
  createdAt: string;
  isBlocked: boolean;
  token: string;
  onDeleted: (code: string) => void;
  onUpdated: (code: string, newUrl: string) => void;
}

export function LinkRowCard({
  code,
  originalUrl,
  createdAt,
  isBlocked,
  token,
  onDeleted,
  onUpdated,
}: LinkRowCardProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { deleteLink, deleteError } = useDeleteLink(token);
  const { analytics, analyticsLoading, analyticsError, loadAnalytics, resetAnalytics } =
    useLinkAnalytics(code, token);

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
    loadAnalytics();
  };

  return (
    <div className="bg-card border-border rounded-2xl border shadow-sm transition-all duration-200 hover:border-primary/30 card-lift">
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {editingCode === code ? (
          <LinkEditForm
            code={code}
            currentUrl={originalUrl}
            token={token}
            onSaved={(c, newUrl) => {
              onUpdated(c, newUrl);
              setEditingCode(null);
            }}
            onCancel={() => setEditingCode(null)}
          />
        ) : (
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="text-sm font-mono font-bold text-primary hover:underline cursor-pointer shrink-0 bg-transparent border-none p-0 focus-ring touch-target btn-press rounded-full"
                onClick={() => window.open(fullShortUrl, '_blank')}
              >
                /{code}
              </button>
              <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full font-medium font-mono flex items-center gap-1 shrink-0">
                <Calendar aria-hidden="true" className="w-3 h-3" />
                {new Intl.DateTimeFormat('ar-SA', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  calendar: 'islamic-umalqura',
                  numberingSystem: 'latn',
                }).format(new Date(createdAt))}
              </span>
              {isBlocked && (
                <span className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full font-bold">
                  محظور من قِبَل الإدارة
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate" title={originalUrl}>
              {originalUrl}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            onClick={handleCopy}
            aria-label="نسخ الرابط"
            className="p-3.5 bg-muted/50 hover:bg-muted border border-border text-muted-foreground hover:text-primary rounded-full transition-colors cursor-pointer btn-press focus-ring touch-target"
            title="نسخ الرابط"
          >
            {copiedCode === code ? (
              <Check aria-hidden="true" className="w-4 h-4 text-success" />
            ) : (
              <Copy aria-hidden="true" className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => setEditingCode(code)}
            aria-label="تعديل الرابط الوجهة"
            className="p-3.5 bg-muted/50 hover:bg-muted border border-border text-muted-foreground hover:text-primary rounded-full transition-colors cursor-pointer btn-press focus-ring touch-target"
            title="تعديل الرابط الوجهة"
          >
            <Pencil aria-hidden="true" className="w-4 h-4" />
          </button>

          <button
            onClick={handleAnalyticsToggle}
            aria-expanded={isExpanded}
            aria-controls={`analytics-panel-${code}`}
            className={cn(
              'px-3 py-2.5 border rounded-full font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer focus-ring touch-target btn-press',
              isExpanded
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted/50 hover:bg-primary/5 hover:border-primary/30 border-border text-muted-foreground'
            )}
          >
            <BarChart3 aria-hidden="true" className="w-3.5 h-3.5" />
            <span>التَّحليلات</span>
            {isExpanded ? (
              <ChevronUp aria-hidden="true" className="w-3 h-3 ms-0.5" />
            ) : (
              <ChevronDown aria-hidden="true" className="w-3 h-3 ms-0.5" />
            )}
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="حذف الرابط"
            className="p-3.5 bg-muted/50 hover:bg-destructive/10 hover:border-destructive/30 border border-border text-muted-foreground hover:text-destructive rounded-full transition-colors cursor-pointer btn-press focus-ring touch-target"
            title="حذف الرابط"
          >
            <Trash2 aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          aria-live="polite"
          className="mx-5 mb-4 p-2.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg flex items-center gap-1.5"
        >
          <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      <div id={`analytics-panel-${code}`}>
        <LinkAnalyticsDrawer
          isExpanded={isExpanded}
          analyticsLoading={analyticsLoading}
          analyticsError={analyticsError}
          analytics={analytics}
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
    </div>
  );
}
