'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { ConsultationPackage } from '@/shared/contracts/consultation';
import {
  adminCreatePackage,
  adminDeletePackage,
  adminListPackages,
  adminUpdatePackage,
} from '@/frontend/api/consultation-admin';
import { Label } from '@/frontend/ui/primitives/label';
import { Input } from '@/frontend/ui/primitives/input';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { cn } from '@/frontend/shared/cn';

interface PackageDraft {
  name: string;
  description: string;
  price_usd: string;
  duration_minutes: string;
  sessions_count: string;
  is_active: boolean;
}

const EMPTY_DRAFT: PackageDraft = {
  name: '',
  description: '',
  price_usd: '25',
  duration_minutes: '60',
  sessions_count: '1',
  is_active: true,
};

export function AdminPackagesView() {
  const [packages, setPackages] = useState<ConsultationPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PackageDraft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPackages(await adminListPackages());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setShowForm(true);
    setMessage(null);
  }

  function startEdit(pkg: ConsultationPackage) {
    setEditingId(pkg.id);
    setDraft({
      name: pkg.name,
      description: pkg.description ?? '',
      price_usd: String(pkg.price_usd),
      duration_minutes: String(pkg.duration_minutes),
      sessions_count: String(pkg.sessions_count),
      is_active: pkg.is_active,
    });
    setShowForm(true);
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      price_usd: Number(draft.price_usd),
      duration_minutes: Number(draft.duration_minutes),
      sessions_count: Number(draft.sessions_count),
      is_active: draft.is_active,
      sort_order: editingId
        ? (packages.find((p) => p.id === editingId)?.sort_order ?? 0)
        : packages.length,
    };

    if (!payload.name || !(payload.price_usd > 0)) {
      setMessage({ ok: false, text: 'الاسم والسعر مطلوبان.' });
      return;
    }

    setSaving(true);
    const result = editingId
      ? await adminUpdatePackage(editingId, payload)
      : await adminCreatePackage(payload);
    setSaving(false);

    if (result.success) {
      setMessage({ ok: true, text: editingId ? 'تم تحديث الباقة.' : 'تمت إضافة الباقة.' });
      setShowForm(false);
      void refresh();
    } else {
      setMessage({ ok: false, text: result.error ?? 'فشل الحفظ.' });
    }
  }

  async function handleDelete(id: string) {
    if (
      !window.confirm('حذف الباقة نهائيًا؟ إن كانت مرتبطة بحجوزات فسيفشل الحذف — عطّلها بدلًا منه.')
    )
      return;
    const result = await adminDeletePackage(id);
    if (result.success) {
      void refresh();
    } else {
      setMessage({ ok: false, text: result.error ?? 'فشل حذف الباقة.' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showForm ? (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11"
          >
            <Plus className="size-4" />
            باقة جديدة
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11"
          >
            <X className="size-4" />
            إلغاء
          </button>
        )}
      </div>

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

      {showForm && (
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-border bg-card p-5 space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-field">
              <Label htmlFor="pkg-name" className="form-label">
                اسم الباقة *
              </Label>
              <Input
                id="pkg-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={160}
                placeholder="مثال: استشارة موسّعة — 3 جلسات"
                className="bg-muted border-border rounded-xl focus-ring"
              />
            </div>
            <div className="form-field">
              <Label htmlFor="pkg-price" className="form-label">
                السعر ($)
              </Label>
              <Input
                id="pkg-price"
                type="number"
                min={1}
                step={0.5}
                value={draft.price_usd}
                onChange={(e) => setDraft({ ...draft, price_usd: e.target.value })}
                className="bg-muted border-border rounded-xl focus-ring"
              />
            </div>
            <div className="form-field">
              <Label htmlFor="pkg-duration" className="form-label">
                مدة الجلسة (دقيقة)
              </Label>
              <Input
                id="pkg-duration"
                type="number"
                min={15}
                max={480}
                step={15}
                value={draft.duration_minutes}
                onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })}
                className="bg-muted border-border rounded-xl focus-ring"
              />
            </div>
            <div className="form-field">
              <Label htmlFor="pkg-sessions" className="form-label">
                عدد الجلسات
              </Label>
              <Input
                id="pkg-sessions"
                type="number"
                min={1}
                max={20}
                value={draft.sessions_count}
                onChange={(e) => setDraft({ ...draft, sessions_count: e.target.value })}
                className="bg-muted border-border rounded-xl focus-ring"
              />
            </div>
          </div>

          <div className="form-field">
            <Label htmlFor="pkg-desc" className="form-label">
              الوصف
            </Label>
            <Textarea
              id="pkg-desc"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={1000}
              className="bg-muted border-border rounded-xl focus-ring"
            />
          </div>

          <label className="flex items-center gap-3 text-sm font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              className="accent-primary size-4"
            />
            الباقة فعّالة وتظهر للزوار
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {editingId ? 'حفظ التعديلات' : 'إضافة الباقة'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="space-y-2">
          {packages.map((pkg) => (
            <li
              key={pkg.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-foreground">
                  {pkg.name}{' '}
                  {!pkg.is_active && (
                    <span className="ms-2 rounded-full bg-muted border border-border px-2 py-0.5 text-xs text-muted-foreground align-middle">
                      معطّلة
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ${pkg.price_usd} · {pkg.duration_minutes} دقيقة ·{' '}
                  {pkg.sessions_count === 1 ? 'جلسة واحدة' : `${pkg.sessions_count} جلسات`}
                </p>
              </div>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(pkg)}
                  aria-label={`تعديل ${pkg.name}`}
                  className="inline-flex items-center justify-center rounded-full border border-border p-2.5 hover:border-primary/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(pkg.id)}
                  aria-label={`حذف ${pkg.name}`}
                  className="inline-flex items-center justify-center rounded-full border border-destructive/50 p-2.5 text-destructive hover:bg-destructive/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
