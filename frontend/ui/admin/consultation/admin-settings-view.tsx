'use client';

import { useEffect, useReducer } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { ConsultationSettings } from '@/shared/contracts/consultation';
import { adminSaveSettings } from '@/frontend/api/consultation-admin';
import { fetchConsultationSettings } from '@/frontend/api/consultation';
import { Label } from '@/frontend/ui/primitives/label';
import { Input } from '@/frontend/ui/primitives/input';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { cn } from '@/frontend/shared/cn';
import {
  adminSettingsInitialState,
  adminSettingsReducer,
} from '@/frontend/ui/admin/consultation/admin-settings-view.reducer';

const FIELDS: Array<{
  key: keyof ConsultationSettings;
  label: string;
  hint?: string;
  dir?: 'ltr' | 'rtl';
}> = [
  {
    key: 'booking_whatsapp_url',
    label: 'رابط واتساب استقبال طلبات الحجز',
    hint: 'يُستخدم في زر واتساب الذي يفتحه الحاجز بعد إرسال طلبه (wa.me أو chat.whatsapp.com)',
    dir: 'ltr',
  },
];

export function AdminSettingsView() {
  const [state, dispatch] = useReducer(adminSettingsReducer, undefined, adminSettingsInitialState);
  const { draft, loading, saving, message } = state;

  useEffect(() => {
    fetchConsultationSettings().then((settings) => {
      dispatch({ type: 'loaded', settings });
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ type: 'saveStarted' });
    const result = await adminSaveSettings(draft);
    if (result.success) {
      dispatch({ type: 'saveSucceeded' });
    } else {
      dispatch({
        type: 'saveFailed',
        text: result.fieldErrors
          ? Object.values(result.fieldErrors).join('، ')
          : (result.error ?? 'فشل الحفظ.'),
      });
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="جاري التَّحميل..."
        className="border-border bg-card mx-auto max-w-2xl space-y-5 rounded-2xl border p-4 sm:p-6"
      >
        <Skeleton decorative className="h-3.5 w-40 max-w-full" />
        <Skeleton decorative className="h-11 w-full" />
        <Skeleton decorative className="h-11 w-40 max-w-full" />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="border-border bg-card mx-auto max-w-2xl space-y-5 rounded-2xl border p-4 sm:p-6"
      noValidate
    >
      {FIELDS.map(({ key, label, hint, dir }) => (
        <div key={key} className="form-field">
          <Label htmlFor={`settings-${key}`} className="form-label">
            {label}
          </Label>
          <Input
            id={`settings-${key}`}
            value={draft[key] ?? ''}
            onChange={(e) => dispatch({ type: 'fieldChanged', key, value: e.target.value })}
            dir={dir}
            className={cn(
              'bg-muted border-border rounded-xl focus-ring',
              dir === 'ltr' && 'text-left'
            )}
          />
          {hint && <p className="form-help-text">{hint}</p>}
        </div>
      ))}

      {message && (
        <p
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            message.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          )}
          role="status"
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-60"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        حفظ الإعدادات
      </button>
    </form>
  );
}
