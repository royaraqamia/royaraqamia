'use client';

import { useState } from 'react';
import { Check, Eye, EyeOff, Trash } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/frontend/ui/primitives/button';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { bulkPostAction } from '@/frontend/api/blogpress';
import { cn } from '@/frontend/shared/cn';
import type { Post } from '@/shared/contracts/blogpress';

interface PostBulkBarProps {
  /** The filtered rows: select-all reaches these, and only these. */
  rows: Post[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  /** Repaints the store after a server-owned transition. */
  onChanged: () => Promise<void> | void;
}

function requireConnection(action: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast.error(`${action} يتطلَّب اتصالاً بالإنترنت`);
    return false;
  }
  return true;
}

/**
 * Select-all, the count, and the three verbs that reach more than one post.
 *
 * The bar is furniture only while it has work to do: with nothing selected it
 * is one quiet line — select-all and the count — instead of a bordered toolbar
 * holding three dead buttons.
 */
export function PostBulkBar({
  rows,
  selected,
  allSelected,
  onToggleAll,
  onClear,
  onChanged,
}: PostBulkBarProps) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = async (action: 'publish' | 'unpublish' | 'delete') => {
    if (
      (action === 'publish' || action === 'unpublish') &&
      !requireConnection('تغيير حالة النَّشر')
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await bulkPostAction(action, Array.from(selected));
      toast.success(
        action === 'delete'
          ? `تمَّ حذف ${result.affected} منشور`
          : action === 'publish'
            ? `تمَّ نشر ${result.affected} منشور`
            : `تمَّ إلغاء نشر ${result.affected} منشور`
      );
      onClear();
      setConfirmOpen(false);
      await onChanged();
    } catch {
      toast.error('فشل تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          selected.size > 0
            ? 'sticky top-[calc(var(--roy-navbar-space)_+_0.75rem)] z-20 rounded-2xl border border-border bg-card/95 p-3 shadow-sm'
            : 'py-1'
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={allSelected}
          onClick={onToggleAll}
          className="inline-flex items-center gap-2 p-1 text-xs font-bold text-foreground"
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-md border',
              allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
            )}
          >
            {allSelected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          تحديد الكل
        </button>
        <span className="text-xs text-muted-foreground">
          {selected.size > 0 ? `${selected.size} من ${rows.length}` : `${rows.length} منشور`}
        </span>
        {selected.size > 0 ? (
          <>
            <div className="flex-1" />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('publish')}>
              <Eye className="me-1.5 size-3.5" />
              نشر
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run('unpublish')}
            >
              <EyeOff className="me-1.5 size-3.5" />
              إلغاء النَّشر
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash className="me-1.5 size-3.5" />
              حذف
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="حذف المنشورات"
        message={`هل تريد حذف ${selected.size} منشور؟ لا يمكن التَّراجع بعد انتهاء المهلة.`}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        icon={Trash}
        variant="danger"
        onConfirm={() => void run('delete')}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
