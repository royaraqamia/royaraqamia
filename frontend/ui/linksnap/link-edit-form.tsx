'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { LinksnapApiClient } from '@/frontend/api/linksnap';

interface LinkEditFormProps {
  code: string;
  currentUrl: string;
  token: string;
  onSaved: (code: string, newUrl: string) => void;
  onCancel: () => void;
}

export function LinkEditForm({ code, currentUrl, token, onSaved, onCancel }: LinkEditFormProps) {
  const [editingUrlValue, setEditingUrlValue] = useState(currentUrl);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const link = await LinksnapApiClient.updateLink(code, editingUrlValue, token);
      onSaved(code, link.originalUrl);
      toast.success('تم تحديث الرابط بنجاح');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في تحديث الرَّابط.';
      setUpdateError(msg);
      toast.error(msg);
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <div className="space-y-1.5 flex-1 min-w-0 max-w-xl">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-mono font-bold text-primary">/{code}</span>
      </div>
      <form onSubmit={handleSubmit} className="mt-1 space-y-1.5">
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
