'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  LoaderCircle,
  CalendarClock,
  Globe,
  Link2,
  AlertCircle,
  Trash2,
  Clock,
  Check,
  Pencil,
  Lock,
} from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { useUpdateLink } from '@/frontend/state/linksnap/use-links';
import { useSlugAvailability } from '@/frontend/state/linksnap/use-slug-availability';
import { getBaseUrl } from '@/frontend/shared/get-base-url';
import { DatePicker } from '@/frontend/ui/primitives/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { Button } from '@/frontend/ui/primitives/button';
import type { ShortenedLink } from '@/frontend/api/linksnap';

interface LinkEditDialogProps {
  open: boolean;
  code: string;
  currentUrl: string;
  currentExpiresAt: string | null;
  currentPasswordProtected: boolean;
  token: string;
  onSaved: (link: ShortenedLink) => void;
  onClose: () => void;
}

function splitExpiry(value: string | null): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
}

export function LinkEditDialog({
  open,
  code,
  currentUrl,
  currentExpiresAt,
  currentPasswordProtected,
  token,
  onSaved,
  onClose,
}: LinkEditDialogProps) {
  const [editingUrlValue, setEditingUrlValue] = useState(currentUrl);
  const [editingCodeValue, setEditingCodeValue] = useState(code);
  const [expiresDateValue, setExpiresDateValue] = useState('');
  const [expiresTimeValue, setExpiresTimeValue] = useState('');
  const [passwordEnabled, setPasswordEnabled] = useState(currentPasswordProtected);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const hasExpiry = Boolean(expiresDateValue || expiresTimeValue);
  const { updateLink, updateLoading, updateError } = useUpdateLink(token);
  const { status: slugStatus, error: slugError } = useSlugAvailability(
    editingCodeValue,
    token,
    code
  );

  useEffect(() => {
    if (open) {
      const initial = splitExpiry(currentExpiresAt);
      setEditingUrlValue(currentUrl);
      setEditingCodeValue(code);
      setExpiresDateValue(initial.date);
      setExpiresTimeValue(initial.time);
      setPasswordEnabled(currentPasswordProtected);
      setPasswordValue('');
      setPasswordError(null);
    }
  }, [open, currentUrl, currentExpiresAt, currentPasswordProtected, code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    let password: string | null | undefined;
    if (!passwordEnabled) {
      password = currentPasswordProtected ? null : undefined;
    } else if (passwordValue.trim()) {
      password = passwordValue;
    } else if (!currentPasswordProtected) {
      setPasswordError('أدخل كلمة مرور لتفعيل الحماية أو ألغِ تفعيلها.');
      return;
    }

    try {
      const link = await updateLink(code, {
        newCode: editingCodeValue !== code ? editingCodeValue : undefined,
        originalUrl: editingUrlValue,
        expiresAt: expiresDateValue
          ? new Date(`${expiresDateValue}T${expiresTimeValue || '23:59'}`).toISOString()
          : null,
        password,
      });
      onSaved(link);
      toast.success('تم تحديث الرابط بنجاح');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في تحديث الرابط.';
      toast.error(msg);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="sm:max-w-lg w-[calc(100%-2rem)] mx-auto p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 dark:border-neutral-800 bg-background/95 dark:bg-neutral-900/95 backdrop-blur-2xl shadow-2xl dark:shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)] transition-all duration-300"
      >
        {/* Subtle Ambient Light Glow Accent */}
        <div
          className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-transparent via-primary/50 to-transparent"
          aria-hidden="true"
        />

        {/* Dialog Header */}
        <DialogHeader className="px-6 py-5 sm:px-7 sm:py-6 text-start border-b border-border/50 dark:border-neutral-800 bg-muted/30 dark:bg-neutral-900/50 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs shrink-0">
              <Link2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              تعديل الرابط المُختصَر
            </DialogTitle>
          </div>
          <DialogDescription className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span className="font-medium shrink-0">كود الرابط:</span>
            <code className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background dark:bg-neutral-800/90 border border-border/60 dark:border-neutral-700/60 font-mono font-semibold text-foreground tracking-wide max-w-50 sm:max-w-70 truncate">
              <span className="text-primary font-bold">/</span>
              <span className="truncate">{code}</span>
            </code>
          </DialogDescription>
        </DialogHeader>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-6 text-start">
          {/* Short Slug Input Field */}
          <div className="space-y-2">
            <label
              htmlFor="edit-code-input"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-primary" aria-hidden="true" />
                <span>الرمز المُختصَر</span>
              </span>
            </label>
            <div
              className="flex items-center w-full overflow-hidden bg-muted/50 dark:bg-neutral-950/60 border border-border/60 dark:border-neutral-800 rounded-xl focus-within:ring-2 focus-within:ring-primary/20 transition-all"
              dir="ltr"
            >
              <span className="shrink-0 pr-3 text-sm text-muted-foreground font-semibold select-none whitespace-nowrap py-2.5 leading-snug">
                {getBaseUrl()}/
              </span>
              <input
                id="edit-code-input"
                type="text"
                dir="ltr"
                value={editingCodeValue}
                onChange={(e) =>
                  setEditingCodeValue(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16))
                }
                maxLength={16}
                className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm font-mono font-semibold focus:outline-none focus-visible:ring-0 text-foreground placeholder:text-muted-foreground/40"
                aria-describedby="edit-code-hint"
                aria-invalid={slugStatus === 'taken' ? true : undefined}
              />
            </div>
            <div
              id="edit-code-hint"
              role="status"
              aria-live="polite"
              className="flex items-center gap-1.5 text-xs font-medium"
            >
              {slugStatus === 'checking' ? (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                  جاري التحقق من التوفر...
                </span>
              ) : slugStatus === 'available' ? (
                <span className="text-success flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {editingCodeValue === code
                    ? 'هذا هو رمزك الحالي.'
                    : 'هذا الرمز متاح — سيتغير عنوان الرابط إلى هذا الرمز.'}
                </span>
              ) : slugStatus === 'taken' ? (
                <span className="text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {slugError}
                </span>
              ) : (
                <span className="text-muted-foreground/70">3-16 حرفاً (أحرف، أرقام، - و _)</span>
              )}
            </div>
          </div>

          {/* Destination URL Input Field */}
          <div className="space-y-2">
            <label
              htmlFor="edit-url-input"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <span>الرابط الوجهة</span>
                <span className="text-destructive font-bold" aria-hidden="true">
                  *
                </span>
              </span>
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                <Globe className="w-4 h-4" aria-hidden="true" />
              </div>
              <input
                id="edit-url-input"
                type="url"
                required
                value={editingUrlValue}
                onChange={(e) => setEditingUrlValue(e.target.value)}
                className="w-full h-11 pr-10 pl-4 rounded-xl border border-border/60 dark:border-neutral-800 bg-background dark:bg-neutral-950/60 text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary hover:border-border transition-all duration-200 shadow-xs"
                placeholder="https://example.com"
                aria-describedby={updateError ? 'edit-url-error' : undefined}
                aria-invalid={updateError ? true : undefined}
              />
            </div>
          </div>

          {/* Expiry Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="edit-expiry-date"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"
              >
                <CalendarClock className="w-4 h-4 text-primary" aria-hidden="true" />
                <span>تاريخ الانتهاء</span>
                <span className="text-[10px] font-normal tracking-normal text-muted-foreground/70 lowercase px-2 py-0.5 rounded-full bg-muted dark:bg-neutral-800 border border-border/40">
                  (اختياري)
                </span>
              </label>
              {hasExpiry && (
                <button
                  type="button"
                  onClick={() => {
                    setExpiresDateValue('');
                    setExpiresTimeValue('');
                  }}
                  aria-label="إزالة تاريخ الانتهاء"
                  title="إزالة تاريخ الانتهاء (رابط دائم)"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 rounded-lg px-2 py-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>إزالة الانتهاء</span>
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <DatePicker
                value={expiresDateValue}
                onChange={setExpiresDateValue}
                placeholder="اختر تاريخ الانتهاء"
                aria-label="تاريخ انتهاء صلاحية الرابط"
                className="w-full h-11 px-3.5 bg-background dark:bg-neutral-950/60 border-border/60 dark:border-neutral-800 hover:border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 transition-all duration-200 shadow-xs"
              />
              <div className="relative shrink-0 w-full sm:w-36">
                <input
                  id="edit-expiry-time-input"
                  type="time"
                  value={expiresTimeValue}
                  onChange={(e) => setExpiresTimeValue(e.target.value)}
                  aria-label="وقت انتهاء الصلاحية"
                  className="w-full h-11 px-3.5 bg-background dark:bg-neutral-950/60 border border-border/60 dark:border-neutral-800 hover:border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 shadow-xs"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground/80 leading-relaxed flex items-center gap-1.5 pt-0.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
              <span>عند انتهاء الصلاحية يتوقف الرابط عن العمل تلقائيًا.</span>
            </p>
          </div>

          {/* Password Protection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="edit-password-toggle"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4 text-primary" aria-hidden="true" />
                <span>حماية بكلمة مرور</span>
                <span className="text-[10px] font-normal tracking-normal text-muted-foreground/70 lowercase px-2 py-0.5 rounded-full bg-muted dark:bg-neutral-800 border border-border/40">
                  (اختياري)
                </span>
              </label>
              <button
                id="edit-password-toggle"
                type="button"
                role="switch"
                aria-checked={passwordEnabled}
                onClick={() => {
                  setPasswordEnabled((prev) => !prev);
                  setPasswordError(null);
                }}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  passwordEnabled
                    ? 'bg-primary border-primary/60'
                    : 'bg-muted border-border/60 dark:bg-neutral-800'
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                    passwordEnabled ? 'translate-x-[calc(100%+2px)]' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            {passwordEnabled && (
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                />
                <input
                  id="edit-password-input"
                  type="password"
                  value={passwordValue}
                  onChange={(e) => {
                    setPasswordValue(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder={
                    currentPasswordProtected
                      ? 'اتركه فارغاً للإبقاء على كلمة المرور الحالية'
                      : 'كلمة مرور تُطلب من الزائر قبل فتح الرابط'
                  }
                  autoComplete="new-password"
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? 'edit-password-error' : 'edit-password-hint'}
                  className="w-full h-11 pr-10 pl-4 rounded-xl border border-border/60 dark:border-neutral-800 bg-background dark:bg-neutral-950/60 text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 shadow-xs"
                />
                <p
                  id="edit-password-hint"
                  className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed"
                >
                  تُحفظ كلمة المرور مشفّرةً ولا يمكن استرجاعها؛ لمنع الحماية اترك الحقل فارغاً وأطفئ
                  المفتاح.
                </p>
              </div>
            )}

            {passwordError && (
              <p
                id="edit-password-error"
                role="alert"
                className="text-xs font-medium text-destructive flex items-center gap-1.5"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {passwordError}
              </p>
            )}
          </div>

          {/* Dynamic Error Feedback */}
          {updateError && (
            <div
              id="edit-url-error"
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 dark:bg-destructive/15 border border-destructive/25 text-destructive dark:text-red-400 text-xs font-medium leading-normal animate-in fade-in duration-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="flex-1">{updateError}</span>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="pt-4 sm:pt-5 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 border-t border-border/50 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto h-10 rounded-xl px-5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/60 transition-all duration-200 active:scale-[0.98] cursor-pointer"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={updateLoading || slugStatus === 'taken' || slugStatus === 'checking'}
              className="w-full sm:w-auto h-10 rounded-xl px-6 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
            >
              {updateLoading ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin opacity-90" aria-hidden="true" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <span>حفظ التغييرات</span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
