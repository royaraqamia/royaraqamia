'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, X } from 'lucide-react';
import { useUpdateLink } from '@/frontend/state/linksnap/use-links';
import type { ShortenedLink } from '@/frontend/api/linksnap';

interface LinkEditFormProps {
  code: string;
  currentUrl: string;
  currentExpiresAt: string | null;
  token: string;
  onSaved: (link: ShortenedLink) => void;
  onCancel: () => void;
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

export function LinkEditForm({
  code,
  currentUrl,
  currentExpiresAt,
  token,
  onSaved,
  onCancel,
}: LinkEditFormProps) {
  const [editingUrlValue, setEditingUrlValue] = useState(currentUrl);
  const [expiresAtValue, setExpiresAtValue] = useState(toDatetimeLocal(currentExpiresAt));
  const { updateLink, updateLoading, updateError } = useUpdateLink(token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const link = await updateLink(code, {
        originalUrl: editingUrlValue,
        expiresAt: expiresAtValue ? new Date(expiresAtValue).toISOString() : null,
      });
      onSaved(link);
      toast.success('تم تحديث الرابط بنجاح');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في تحديث الرابط.';
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-1.5 flex-1 min-w-0 max-w-xl">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-mono font-bold text-primary">/{code}</span>
      </div>
      <form onSubmit={handleSubmit} className="mt-1 space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <label htmlFor="edit-url-input" className="sr-only">
            الرابط الجديد
          </label>
          <input
            id="edit-url-input"
            type="url"
            required
            value={editingUrlValue}
            onChange={(e) => setEditingUrlValue(e.target.value)}
            className="w-full sm:flex-1 px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground"
            placeholder="الرَّابط الجديد"
            aria-describedby="edit-url-error"
          />
          <div className="flex items-center gap-2 self-end">
            <button
              type="submit"
              disabled={updateLoading}
              className="px-3 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs rounded-full transition-all cursor-pointer btn-press inline-flex items-center gap-1 touch-target focus-ring"
            >
              {updateLoading ? (
                <>
                  <div
                    className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"
                    role="status"
                  />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                'حفظ'
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground font-medium text-xs rounded-full transition-all cursor-pointer btn-press touch-target focus-ring"
            >
              إلغاء
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <CalendarClock
              aria-hidden="true"
              className="w-3.5 h-3.5 text-muted-foreground shrink-0"
            />
            <input
              id="edit-expiry-input"
              type="datetime-local"
              value={expiresAtValue}
              onChange={(e) => setExpiresAtValue(e.target.value)}
              className="w-full flex-1 px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground"
              aria-label="تاريخ انتهاء صلاحية الرابط"
            />
            {expiresAtValue && (
              <button
                type="button"
                onClick={() => setExpiresAtValue('')}
                aria-label="إزالة تاريخ الانتهاء"
                title="إزالة تاريخ الانتهاء (رابط دائم)"
                className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors cursor-pointer shrink-0 touch-target focus-ring"
              >
                <X aria-hidden="true" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground/70 sm:text-right sm:w-35">
            عند انتهاء الصلاحية يتوقف الرابط عن العمل
          </span>
        </div>

        {updateError && (
          <div
            id="edit-url-error"
            role="alert"
            aria-live="polite"
            className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-2 py-1 rounded-md"
          >
            {updateError}
          </div>
        )}
      </form>
    </div>
  );
}
