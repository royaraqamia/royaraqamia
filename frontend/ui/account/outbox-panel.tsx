'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, Trash2 } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { useOutboxDiagnostics } from '@/frontend/state/habitflow/use-outbox-diagnostics';
import { Button } from '@/frontend/ui/primitives/button';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

const TYPE_LABELS: Record<string, string> = {
  'habit.create': 'إضافة عادة',
  'habit.update': 'تعديل عادة',
  'habit.delete': 'أرشفة عادة',
  'log.toggle': 'تسجيل عادة',
  'log.kind': 'تحديث حالة عادة',
  'log.note': 'تحديث ملاحظة عادة',
  'backup.restore': 'استعادة نسخة احتياطية',
};

function label(entry: OutboxEntry): string {
  return TYPE_LABELS[entry.type] ?? entry.type;
}

const badgeClasses =
  'shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold border whitespace-nowrap';

/**
 * The `/account` Outbox view (ADR-0027). It answers "is my work on the server
 * yet, and what do I do if it is not?" — listing queued changes, surfacing
 * permanent failures, offering a retry, and letting the user remove this
 * device's copy without touching the server.
 */
export function OutboxPanel() {
  const { user } = useSession();
  const { ready, online, entries, pending, failed, retrying, retry, removeLocalCopy } =
    useOutboxDiagnostics(user);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!user) return null;

  return (
    <section
      aria-label="مزامنة بيانات العادات"
      className="space-y-4 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-bold text-foreground sm:text-lg">مزامنة بيانات العادات</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
            {online ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <CloudOff className="h-3.5 w-3.5" />
            )}
            <span>
              {online ? 'متَّصل' : 'غير متَّصل'}
              {' · '}
              {pending} قيد الانتظار
              {failed > 0 && ` · ${failed} فشل`}
            </span>
          </p>
        </div>

        {failed > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void retry()}
            disabled={retrying}
            className="shrink-0 rounded-xl text-xs sm:text-sm font-bold"
          >
            <RefreshCw className={cn('h-4 w-4', retrying && 'animate-spin')} />
            إعادة المحاولة
          </Button>
        )}
      </header>

      {!ready ? (
        <p className="text-xs text-muted-foreground sm:text-sm" aria-busy="true">
          جارٍ التحميل…
        </p>
      ) : entries.length === 0 ? (
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          كل التَّغييرات متزامِنة
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.seq}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-background/50 px-3 py-2.5"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-bold text-foreground">{label(entry)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString('ar')}
                </p>
                {entry.status === 'failed' && entry.lastError && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive/90">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{entry.lastError}</span>
                  </p>
                )}
              </div>
              <span
                className={cn(
                  badgeClasses,
                  entry.status === 'failed'
                    ? 'bg-destructive/10 text-destructive border-destructive/20'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                )}
              >
                {entry.status === 'failed' ? 'فشل' : 'قيد الانتظار'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-muted-foreground">
          تُحفَظ بيانات العادات على هذا الجهاز وتُزامَن عند الاتصال.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmRemove(true)}
          className="shrink-0 rounded-xl text-xs font-bold text-destructive/90 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          إزالة نسخة هذا الجهاز
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="إزالة نسخة هذا الجهاز"
        message="سيتم حذف بيانات العادات والسِّجلات المخزَّنة على هذا الجهاز. تبقى بياناتك على الخادم وتُستعاد عند فتحها مجدَّدًا. هل أنت متأكِّد؟"
        confirmLabel="إزالة"
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={() => {
          setConfirmRemove(false);
          void removeLocalCopy();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </section>
  );
}
