'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { ConsultationSettings } from '@/shared/contracts/consultation';
import { adminSaveSettings } from '@/frontend/api/consultation-admin';
import { fetchPaymentConfig } from '@/frontend/api/consultation';
import { Label } from '@/frontend/ui/primitives/label';
import { Input } from '@/frontend/ui/primitives/input';
import { cn } from '@/frontend/shared/cn';

type SettingsDraft = Partial<ConsultationSettings>;

const FIELDS: Array<{
  key: keyof ConsultationSettings;
  label: string;
  hint?: string;
  dir?: 'ltr' | 'rtl';
}> = [
  {
    key: 'booking_whatsapp_url',
    label: 'رابط واتساب استقبال الإيصالات',
    hint: 'يُستخدم في زر إرسال الإيصال لدى الحاجزين (wa.me أو chat.whatsapp.com)',
    dir: 'ltr',
  },
  {
    key: 'payment_shamcash_code',
    label: 'رمز إيصال شام كاش',
    hint: 'الرمز الذي ينسخه الدافع ويلصقه في تطبيق شام كاش لإتمام التحويل',
    dir: 'ltr',
  },
  {
    key: 'payment_moneygram_name',
    label: 'MoneyGram — اسم المستفيد',
  },
  {
    key: 'payment_moneygram_phone',
    label: 'MoneyGram — رقم الهاتف',
    dir: 'ltr',
  },
  {
    key: 'payment_moneygram_branch',
    label: 'MoneyGram — الفرع المفضّل',
  },
];

export function AdminSettingsView() {
  const [draft, setDraft] = useState<SettingsDraft>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchPaymentConfig().then((settings) => {
      setDraft(settings);
      setLoading(false);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const result = await adminSaveSettings(draft);
    setSaving(false);
    if (result.success) {
      setMessage({ ok: true, text: 'تم حفظ الإعدادات.' });
    } else {
      setMessage({
        ok: false,
        text: result.fieldErrors
          ? Object.values(result.fieldErrors).join('، ')
          : (result.error ?? 'فشل الحفظ.'),
      });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5"
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
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
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
