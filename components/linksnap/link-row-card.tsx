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
import { LinkEditForm } from './link-edit-form';
import { LinkAnalyticsDrawer, AnalyticsData } from './link-analytics-drawer';
import { ConfirmDialog } from './confirm-dialog';
import { cn, getBaseUrl } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fullShortUrl = `${getBaseUrl()}/${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullShortUrl);
      setCopiedCode(code);
      toast.success('تم نسخ الرابط!');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      toast.error('فشل نسخ الرابط');
    }
  };

  const handleDeleteConfirmed = async () => {
    setShowDeleteConfirm(false);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/links?code=${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل في حذف الرَّابط');
      onDeleted(code);
      toast.success('تم حذف الرابط بنجاح');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في حذف الرَّابط.';
      setDeleteError(msg);
      toast.error(msg);
    }
  };

  const loadAnalytics = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      setAnalytics(null);
      return;
    }

    setIsExpanded(true);
    setAnalytics(null);
    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      const res = await fetch(`/api/analytics/${code}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل في جلب التَّحليلات');
      setAnalytics(data.analytics);
    } catch (err: unknown) {
      setAnalyticsError(err instanceof Error ? err.message : 'فشل في تحميل التَّحليلات.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all duration-200 hover:border-indigo-100 dark:hover:border-indigo-800">
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
              <span
                className="text-sm font-mono font-bold text-indigo-600 hover:underline cursor-pointer shrink-0"
                onClick={() => window.open(fullShortUrl, '_blank')}
              >
                /{code}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-full font-medium font-mono flex items-center gap-1 shrink-0">
                <Calendar aria-hidden="true" className="w-3 h-3" />
                {new Date(createdAt).toLocaleDateString('ar-EG', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              {isBlocked && (
                <span className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 px-2 py-0.5 rounded-full font-bold">
                  محظور من قِبَل الإدارة
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-500 truncate" title={originalUrl}>
              {originalUrl}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            onClick={handleCopy}
            aria-label="نسخ الرابط"
            className="p-2 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer press-scale focus-ring"
            title="نسخ الرابط"
          >
            {copiedCode === code ? (
              <Check aria-hidden="true" className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy aria-hidden="true" className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => setEditingCode(code)}
            aria-label="تعديل الرابط الوجهة"
            className="p-2 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors cursor-pointer press-scale focus-ring"
            title="تعديل الرابط الوجهة"
          >
            <Pencil aria-hidden="true" className="w-4 h-4" />
          </button>

          <button
            onClick={loadAnalytics}
            aria-expanded={isExpanded}
            aria-controls={`analytics-panel-${code}`}
            className={cn(
              'px-3 py-2 border rounded-lg font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer press-scale focus-ring',
              isExpanded
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-50 dark:bg-slate-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:border-indigo-100 dark:hover:border-indigo-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400'
            )}
          >
            <BarChart3 aria-hidden="true" className="w-3.5 h-3.5" />
            <span>التَّحليلات</span>
            {isExpanded ? (
              <ChevronUp aria-hidden="true" className="w-3 h-3 mr-0.5" />
            ) : (
              <ChevronDown aria-hidden="true" className="w-3 h-3 mr-0.5" />
            )}
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="حذف الرابط"
            className="p-2 bg-slate-50 dark:bg-slate-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-100 dark:hover:border-red-800 border border-slate-100 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors cursor-pointer press-scale focus-ring"
            title="حذف الرابط"
          >
            <Trash2 aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {deleteError && (
        <div
          aria-live="polite"
          className="mx-5 mb-4 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-[10px] rounded-lg flex items-center gap-1.5"
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
