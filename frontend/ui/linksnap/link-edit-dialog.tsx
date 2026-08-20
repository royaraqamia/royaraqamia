'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  LoaderCircle,
  CalendarClock,
  Globe,
  Link2,
  AlertCircle,
  Clock,
  Check,
  Pencil,
  ExternalLink,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  Calendar,
  KeyRound,
  CheckCheck,
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

/**
 * Splits an ISO timestamp into separate date (YYYY-MM-DD) and time (HH:mm) strings.
 */
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

/**
 * Formats relative time until expiration in Arabic.
 */
function formatRemainingTime(dateStr: string, timeStr: string): string | null {
  if (!dateStr) return null;
  try {
    const target = new Date(`${dateStr}T${timeStr || '23:59:59'}`);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();

    if (diffMs <= 0) return 'منتهي الصلاحية حالياً';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 30) {
      const months = Math.floor(diffDays / 30);
      return `ينتهي خلال ${months} ${months === 1 ? 'شهر' : months === 2 ? 'شهرين' : 'أشهر'}`;
    }
    if (diffDays > 0) {
      return `ينتهي خلال ${diffDays} ${diffDays === 1 ? 'يوم' : diffDays === 2 ? 'يومين' : 'أيام'}`;
    }
    if (diffHours > 0) {
      return `ينتهي خلال ${diffHours} ${diffHours === 1 ? 'ساعة' : 'ساعات'}`;
    }
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return `ينتهي خلال ${Math.max(1, diffMinutes)} دقيقة`;
  } catch {
    return null;
  }
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
  // --- Form State ---
  const [editingUrlValue, setEditingUrlValue] = useState(currentUrl);
  const [editingCodeValue, setEditingCodeValue] = useState(code);
  const [expiresDateValue, setExpiresDateValue] = useState('');
  const [expiresTimeValue, setExpiresTimeValue] = useState('');
  const [enableExpiry, setEnableExpiry] = useState(Boolean(currentExpiresAt));
  const [passwordEnabled, setPasswordEnabled] = useState(currentPasswordProtected);
  const [passwordValue, setPasswordValue] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const safePreviewHref = useMemo(() => {
    const raw = editingUrlValue.trim();
    if (!raw) return null;

    const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) ? raw : `https://${raw}`;

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  }, [editingUrlValue]);
  const [copiedLink, setCopiedLink] = useState(false);

  // --- API Hooks ---
  const { updateLink, updateLoading, updateError } = useUpdateLink(token);
  const { status: slugStatus, error: slugError } = useSlugAvailability(
    editingCodeValue,
    token,
    code
  );

  const baseUrl = useMemo(() => {
    const b = getBaseUrl();
    return b.replace(/^https?:\/\//, '');
  }, []);

  const fullShortUrl = useMemo(() => {
    return `${getBaseUrl()}/${editingCodeValue || code}`;
  }, [editingCodeValue, code]);

  // Synchronize initial state when dialog opens
  const resetFormState = useCallback(() => {
    const initial = splitExpiry(currentExpiresAt);
    setEditingUrlValue(currentUrl);
    setEditingCodeValue(code);
    setExpiresDateValue(initial.date);
    setExpiresTimeValue(initial.time);
    setEnableExpiry(Boolean(currentExpiresAt));
    setPasswordEnabled(currentPasswordProtected);
    setPasswordValue('');
    setShowPassword(false);
    setPasswordError(null);
    setCopiedLink(false);
  }, [currentUrl, code, currentExpiresAt, currentPasswordProtected]);

  useEffect(() => {
    if (open) {
      resetFormState();
    }
  }, [open, resetFormState]);

  // Track if any changes have been made
  const hasChanges = useMemo(() => {
    const initialExpiry = splitExpiry(currentExpiresAt);
    const urlChanged = editingUrlValue.trim() !== currentUrl.trim();
    const codeChanged = editingCodeValue.trim() !== code.trim();
    const passwordStateChanged = passwordEnabled !== currentPasswordProtected;
    const passwordValueChanged = passwordValue.trim().length > 0;
    const expiryStateChanged = enableExpiry !== Boolean(currentExpiresAt);
    const expiryDateChanged =
      enableExpiry &&
      (expiresDateValue !== initialExpiry.date || expiresTimeValue !== initialExpiry.time);

    return (
      urlChanged ||
      codeChanged ||
      passwordStateChanged ||
      passwordValueChanged ||
      expiryStateChanged ||
      expiryDateChanged
    );
  }, [
    editingUrlValue,
    currentUrl,
    editingCodeValue,
    code,
    passwordEnabled,
    currentPasswordProtected,
    passwordValue,
    enableExpiry,
    currentExpiresAt,
    expiresDateValue,
    expiresTimeValue,
  ]);

  // Quick Preset Handlers for Expiration
  const setExpiryPreset = (hoursFromNow: number) => {
    setEnableExpiry(true);
    const d = new Date();
    d.setTime(d.getTime() + hoursFromNow * 60 * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setExpiresDateValue(`${y}-${m}-${day}`);
    setExpiresTimeValue(`${hh}:${mm}`);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullShortUrl);
      setCopiedLink(true);
      toast.success('تم نسخ الرابط المُختصر إلى الحافظة');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('تعذر نسخ الرابط');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPasswordError(null);

    // Validate Slug status
    if (slugStatus === 'taken') {
      toast.error('الرمز المُختصر مستخدم بالفعل، يرجى اختيار رمز آخر');
      return;
    }

    // Password verification logic
    let password: string | null | undefined;
    if (!passwordEnabled) {
      password = currentPasswordProtected ? null : undefined;
    } else if (passwordValue.trim()) {
      password = passwordValue.trim();
    } else if (!currentPasswordProtected) {
      setPasswordError('يرجى كتابة كلمة المرور لتفعيل الحماية، أو إيقاف تفعيل المفتاح.');
      return;
    }

    // Expiry payload logic
    let expiresAt: string | null = null;
    if (enableExpiry && expiresDateValue) {
      const timePart = expiresTimeValue || '23:59:59';
      expiresAt = new Date(`${expiresDateValue}T${timePart}`).toISOString();
    }

    try {
      const updated = await updateLink(code, {
        newCode: editingCodeValue !== code ? editingCodeValue : undefined,
        originalUrl: editingUrlValue.trim(),
        expiresAt,
        password,
      });
      toast.success('تم حفظ التعديلات بنجاح');
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تحديث الرابط.';
      toast.error(msg);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to quick-submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (
        !updateLoading &&
        slugStatus !== 'taken' &&
        slugStatus !== 'checking' &&
        editingUrlValue.trim() &&
        !slugTooShort &&
        hasChanges
      ) {
        handleSubmit();
      }
    }
  };

  const remainingTimeBadge = useMemo(() => {
    if (!enableExpiry || !expiresDateValue) return null;
    return formatRemainingTime(expiresDateValue, expiresTimeValue);
  }, [enableExpiry, expiresDateValue, expiresTimeValue]);

  const slugTooShort = editingCodeValue.trim().length < 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        onKeyDown={handleKeyDown}
        className="sm:max-w-xl w-[calc(100%-2rem)] mx-auto p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 dark:border-neutral-800/90 bg-background/95 dark:bg-neutral-950/95 backdrop-blur-2xl shadow-2xl dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)] transition-all duration-300 max-h-[calc(100dvh-3rem)] flex flex-col"
      >
        {/* Top Decorative Ambient Accent */}
        <div
          className="h-1.5 w-full bg-linear-to-r from-primary/30 via-primary to-primary/30 shrink-0"
          aria-hidden="true"
        />

        {/* Dialog Header */}
        <DialogHeader className="px-6 py-4.5 sm:px-7 sm:py-5 text-start border-b border-border/50 dark:border-neutral-800/80 bg-muted/20 dark:bg-neutral-900/40 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs shrink-0 flex items-center justify-center">
                <Pencil className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  <span>تعديل الرابط المُختصر</span>
                  {hasChanges && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      تعديلات معلقة
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  قم بتعديل الوجهة، الرمز المخصص، الحماية أو صلاحية الرابط.
                </DialogDescription>
              </div>
            </div>

            {hasChanges && (
              <button
                type="button"
                onClick={resetFormState}
                title="إعادة تعيين القيم الأصلية"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-neutral-800 border border-transparent hover:border-border/60 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إعادة تعيين</span>
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          className="p-5 sm:p-7 space-y-5 overflow-y-auto custom-scrollbar flex-1 min-h-0 text-start"
        >
          {/* Live Link Preview Card */}
          <div className="p-3.5 rounded-2xl bg-muted/40 dark:bg-neutral-900/60 border border-border/70 dark:border-neutral-800/80 space-y-2.5 transition-all">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span>معاينة الرابط المباشر</span>
              </span>
              <div className="flex items-center gap-1.5">
                {passwordEnabled && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                    <ShieldCheck className="w-3 h-3" />
                    محمي
                  </span>
                )}
                {enableExpiry && remainingTimeBadge && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                    <Clock className="w-3 h-3" />
                    {remainingTimeBadge}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-background dark:bg-neutral-950 border border-border/60 dark:border-neutral-800">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden" dir="ltr">
                <Link2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span className="text-xs sm:text-sm font-mono font-bold text-foreground truncate">
                  <span className="text-muted-foreground font-normal">{baseUrl}/</span>
                  <span className="text-primary">{editingCodeValue || '...'}</span>
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0" dir="ltr">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="نسخ الرابط المختصر"
                  aria-label="نسخ الرابط المختصر"
                >
                  {copiedLink ? (
                    <CheckCheck className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Destination URL Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="edit-url-input"
                className="text-xs font-bold text-foreground/90 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span>الرابط الوجهة المستهدف (Destination URL)</span>
                <span className="text-destructive font-bold" aria-hidden="true">
                  *
                </span>
              </label>
              {safePreviewHref && (
                <a
                  href={safePreviewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <span>اختبار الرابط</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="relative group">
              <input
                id="edit-url-input"
                type="url"
                required
                dir="ltr"
                value={editingUrlValue}
                onChange={(e) => setEditingUrlValue(e.target.value)}
                placeholder="https://example.com/very-long-target-url"
                className="w-full h-11 px-3.5 rounded-xl border border-border/70 dark:border-neutral-800 bg-background dark:bg-neutral-950 text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 shadow-xs"
                aria-describedby={updateError ? 'edit-url-error' : undefined}
                aria-invalid={updateError ? true : undefined}
              />
            </div>
          </div>

          {/* Short Slug Input Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="edit-code-input"
                className="text-xs font-bold text-foreground/90 flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                <span>الرمز المُختصَر (Slug)</span>
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {editingCodeValue.length}/16
              </span>
            </div>

            <div
              className={cn(
                'flex items-center w-full overflow-hidden bg-background dark:bg-neutral-950 border rounded-xl transition-all duration-200 shadow-xs focus-within:ring-2',
                slugStatus === 'taken'
                  ? 'border-destructive/60 focus-within:ring-destructive/20'
                  : slugStatus === 'available' && editingCodeValue !== code
                    ? 'border-emerald-500/60 focus-within:ring-emerald-500/20'
                    : 'border-border/70 dark:border-neutral-800 focus-within:ring-primary/20 focus-within:border-primary'
              )}
              dir="ltr"
            >
              <span className="shrink-0 px-3 py-2.5 text-xs sm:text-sm font-mono font-medium text-muted-foreground bg-muted/40 dark:bg-neutral-900/60 border-r border-border/60 dark:border-neutral-800 select-none">
                {baseUrl}/
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
                placeholder="custom-slug"
                className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm font-mono font-semibold focus:outline-none text-foreground placeholder:text-muted-foreground/30"
                aria-describedby="edit-code-hint"
                aria-invalid={slugStatus === 'taken' ? true : undefined}
              />
            </div>

            {/* Slug Status Feedback Banner */}
            <div
              id="edit-code-hint"
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-1.5 text-xs font-medium pt-0.5"
            >
              {slugStatus === 'checking' ? (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                  جاري فحص توفر الرمز...
                </span>
              ) : slugStatus === 'available' ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {editingCodeValue === code
                    ? 'هذا هو الرمز المخصص الحالي.'
                    : 'الرمز متاح وجاهز للاستخدام!'}
                </span>
              ) : slugStatus === 'taken' ? (
                <span className="text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {slugError || 'هذا الرمز مأخوذ من قبل رابط آخر.'}
                </span>
              ) : (
                <span className="text-muted-foreground/70">
                  يتيح من 3 إلى 16 حرفاً (أحرف إنجليزية، أرقام، - و _)
                </span>
              )}
            </div>
          </div>

          {/* Section: Expiry & Security Cards */}
          <div className="space-y-3.5 pt-2">
            {/* Expiration Settings Card */}
            <div
              className={cn(
                'rounded-2xl border transition-all duration-200 overflow-hidden',
                enableExpiry
                  ? 'border-primary/30 bg-primary/5 dark:bg-primary/2'
                  : 'border-border/70 dark:border-neutral-800/80 bg-muted/20 dark:bg-neutral-900/30'
              )}
            >
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-xl border shrink-0 transition-colors',
                      enableExpiry
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted dark:bg-neutral-800 text-muted-foreground border-border/50'
                    )}
                  >
                    <CalendarClock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      تاريخ ووقت انتهاء الصلاحية
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      تعطيل الرابط تلقائياً بعد حلول هذا الموعد
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enableExpiry}
                  aria-label="تفعيل أو تعطيل انتهاء صلاحية الرابط"
                  onClick={() => {
                    const nextState = !enableExpiry;
                    setEnableExpiry(nextState);
                    if (!nextState) {
                      setExpiresDateValue('');
                      setExpiresTimeValue('');
                    } else if (!expiresDateValue) {
                      setExpiryPreset(24 * 7); // Default to 7 days
                    }
                  }}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    enableExpiry
                      ? 'bg-primary border-primary'
                      : 'bg-muted-foreground/20 border-border dark:bg-neutral-800'
                  )}
                  dir="ltr"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200',
                      enableExpiry ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {enableExpiry && (
                <div className="px-4 pb-4 pt-1 border-t border-border/40 dark:border-neutral-800/60 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Quick Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-muted-foreground ml-1">
                      خيارات سريعة:
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpiryPreset(24)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-background dark:bg-neutral-900 border border-border/60 hover:border-primary/40 hover:text-primary transition-all cursor-pointer"
                    >
                      24 ساعة
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpiryPreset(24 * 7)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-background dark:bg-neutral-900 border border-border/60 hover:border-primary/40 hover:text-primary transition-all cursor-pointer"
                    >
                      7 أيام
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpiryPreset(24 * 30)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-background dark:bg-neutral-900 border border-border/60 hover:border-primary/40 hover:text-primary transition-all cursor-pointer"
                    >
                      30 يوماً
                    </button>
                  </div>

                  {/* Pickers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        التاريخ
                      </span>
                      <DatePicker
                        value={expiresDateValue}
                        onChange={setExpiresDateValue}
                        placeholder="اختر التاريخ"
                        aria-label="تاريخ انتهاء الصلاحية"
                        className="w-full h-10 px-3 bg-background dark:bg-neutral-950 border-border/70 dark:border-neutral-800 rounded-xl text-xs font-medium text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        الوقت
                      </span>
                      <input
                        type="time"
                        value={expiresTimeValue}
                        onChange={(e) => setExpiresTimeValue(e.target.value)}
                        aria-label="وقت انتهاء الصلاحية"
                        className="w-full h-10 px-3 bg-background dark:bg-neutral-950 border border-border/70 dark:border-neutral-800 rounded-xl text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Password Protection Card */}
            <div
              className={cn(
                'rounded-2xl border transition-all duration-200 overflow-hidden',
                passwordEnabled
                  ? 'border-primary/30 bg-primary/5 dark:bg-primary/2'
                  : 'border-border/70 dark:border-neutral-800/80 bg-muted/20 dark:bg-neutral-900/30'
              )}
            >
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-xl border shrink-0 transition-colors',
                      passwordEnabled
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted dark:bg-neutral-800 text-muted-foreground border-border/50'
                    )}
                  >
                    <KeyRound className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">الحماية بكلمة مرور</h4>
                    <p className="text-[11px] text-muted-foreground">
                      طلب رمز أمان سري قبل التوجيه إلى الرابط الأصلي
                    </p>
                  </div>
                </div>

                <button
                  id="edit-password-toggle"
                  type="button"
                  role="switch"
                  aria-checked={passwordEnabled}
                  aria-label="تفعيل أو تعطيل الحماية بكلمة مرور"
                  onClick={() => {
                    setPasswordEnabled((prev) => !prev);
                    setPasswordError(null);
                  }}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    passwordEnabled
                      ? 'bg-primary border-primary'
                      : 'bg-muted-foreground/20 border-border dark:bg-neutral-800'
                  )}
                  dir="ltr"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200',
                      passwordEnabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {passwordEnabled && (
                <div className="px-4 pb-4 pt-1 border-t border-border/40 dark:border-neutral-800/60 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                  {currentPasswordProtected && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>
                        الرابط محمي حالياً بكلمة مرور. اتركه فارغاً للإبقاء عليها، أو اكتب كلمة مرور
                        جديدة لتغييرها.
                      </span>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      id="edit-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordValue}
                      dir="ltr"
                      onChange={(e) => {
                        setPasswordValue(e.target.value);
                        setPasswordError(null);
                      }}
                      placeholder={
                        currentPasswordProtected
                          ? '•••••••••••• (اتركه فارغاً للإبقاء على الحالية)'
                          : 'أدخل كلمة مرور قوية'
                      }
                      autoComplete="new-password"
                      aria-invalid={passwordError ? true : undefined}
                      aria-describedby={passwordError ? 'edit-password-error' : undefined}
                      className="w-full h-10 pr-3.5 pl-10 rounded-xl border border-border/70 dark:border-neutral-800 bg-background dark:bg-neutral-950 text-xs font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 cursor-pointer"
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

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
              )}
            </div>
          </div>

          {/* Dynamic Global Update Error */}
          {updateError && (
            <div
              id="edit-url-error"
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-xs font-medium leading-normal animate-in fade-in duration-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="flex-1">{updateError}</span>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="pt-4 sm:pt-5 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-border/50 dark:border-neutral-800/80">
            <div className="text-[11px] text-muted-foreground/80 hidden sm:block">
              اضغط <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Ctrl</kbd>{' '}
              + <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Enter</kbd>{' '}
              للحفظ السريع
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1 sm:flex-initial h-10 rounded-xl px-5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/80 border-border/70 transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={
                  updateLoading ||
                  slugStatus === 'taken' ||
                  slugStatus === 'checking' ||
                  slugTooShort ||
                  !hasChanges
                }
                className="flex-1 sm:flex-initial h-10 rounded-xl px-6 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
              >
                {updateLoading ? (
                  <>
                    <LoaderCircle className="w-4 h-4 animate-spin opacity-90" aria-hidden="true" />
                    <span>جاري حفظ التعديلات...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>حفظ التغييرات</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
