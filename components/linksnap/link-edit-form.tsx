'use client';

import { useState } from 'react';
import { toast } from 'sonner';

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
      const res = await fetch('/linksnap/api/links', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, originalUrl: editingUrlValue }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update URL');

      onSaved(code, data.link.originalUrl);
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
    <div className="space-y-1.5 flex-1 max-w-xl">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-mono font-bold text-indigo-600">/{code}</span>
      </div>
      <form onSubmit={handleSubmit} className="mt-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            type="url"
            required
            value={editingUrlValue}
            onChange={(e) => setEditingUrlValue(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 dark:text-slate-200"
            placeholder="الرَّابط الجديد"
          />
          <button
            type="submit"
            disabled={updateLoading}
            className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-all cursor-pointer press-scale inline-flex items-center gap-1 min-h-[44px]"
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
            className="px-3 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 font-medium text-xs rounded-lg transition-all cursor-pointer press-scale min-h-[44px]"
          >
            إلغاء
          </button>
        </div>
        {updateError && (
          <div
            aria-live="polite"
            className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 px-2 py-1 rounded-md"
          >
            {updateError}
          </div>
        )}
      </form>
    </div>
  );
}
