'use client';

import React, { useReducer, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  LoaderCircle,
  CalendarClock,
  Globe,
  Link2,
  CircleAlert,
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
  CloudOff,
} from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { useUpdateLink } from '@/frontend/state/linksnap/use-links';
import { useSlugAvailability } from '@/frontend/state/linksnap/use-slug-availability';
import { getBaseUrl, getBaseHost } from '@/frontend/shared/get-base-url';
import { DatePicker } from '@/frontend/ui/primitives/date-picker';
import { TimePicker } from '@/frontend/ui/primitives/time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import type { ShortenedLink } from '@/frontend/api/linksnap';
import {
  defaultExpiryParts,
  expiresInParts,
  hasLinkEditChanges,
  linkEditInitialState,
  linkEditReducer,
  type LinkEditBaseline,
} from './link-edit-dialog.reducer';
import { LINK_EDIT_DIALOG_COPY } from './link-edit-dialog-copy';
import { expiryInstant } from '@/frontend/shared/linksnap/expiry';

interface LinkEditDialogProps {
  open: boolean;
  clientId: string;
  code: string;
  currentUrl: string;
  currentExpiresAt: string | null;
  currentPasswordProtected: boolean;
  token: string;
  onSaved: (link: ShortenedLink) => void;
  onClose: () => void;
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

export const LinkEditDialog = React.memo(function LinkEditDialog({
  open,
  clientId,
  code,
  currentUrl,
  currentExpiresAt,
  currentPasswordProtected,
  token,
  onSaved,
  onClose,
}: LinkEditDialogProps) {
  // --- Form State: ten values that reset, toggle and validate as one form ---
  const baseline = useMemo<LinkEditBaseline>(
    () => ({
      url: currentUrl,
      code,
      expiresAt: currentExpiresAt,
      passwordProtected: currentPasswordProtected,
    }),
    [currentUrl, code, currentExpiresAt, currentPasswordProtected]
  );
  const [form, dispatch] = useReducer(linkEditReducer, baseline, linkEditInitialState);

  const safePreviewHref = useMemo(() => {
    const raw = form.url.trim();
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
  }, [form.url]);

  // --- API Hooks ---
  const { updateLink, updateLoading, updateError } = useUpdateLink(token);
  const { status: slugStatus, error: slugError } = useSlugAvailability(form.code, token, code);

  const baseUrl = useMemo(() => getBaseHost(), []);

  const fullShortUrl = useMemo(() => {
    return `${getBaseUrl()}/${form.code || code}`;
  }, [form.code, code]);

  // Synchronize initial state when dialog opens
  const resetFormState = useCallback(() => dispatch({ type: 'reset', baseline }), [baseline]);

  useEffect(() => {
    if (open) {
      resetFormState();
    }
  }, [open, resetFormState]);

  // Track if any changes have been made
  const hasChanges = useMemo(() => hasLinkEditChanges(form, baseline), [form, baseline]);

  // Quick Preset Handlers for Expiration
  const addHoursPreset = (hoursFromNow: number) =>
    dispatch({ type: 'expiryPresetApplied', parts: expiresInParts(hoursFromNow) });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullShortUrl);
      dispatch({ type: 'linkCopied' });
      toast.success('تم نسخ الرَّابط المُختصر إلى الحافظة');
      setTimeout(() => dispatch({ type: 'copyFeedbackCleared' }), 2000);
    } catch {
      toast.error('تعذر نسخ الرَّابط');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    dispatch({ type: 'passwordErrorSet', message: null });

    // Validate Slug status
    if (slugStatus === 'taken') {
      toast.error('الرمز المُختصر مستخدم بالفعل، يرجى اختيار رمز آخر');
      return;
    }

    // Password verification logic
    let password: string | null | undefined;
    if (!form.passwordEnabled) {
      password = currentPasswordProtected ? null : undefined;
    } else if (form.password.trim()) {
      password = form.password.trim();
    } else if (!currentPasswordProtected) {
      dispatch({
        type: 'passwordErrorSet',
        message: LINK_EDIT_DIALOG_COPY.passwordRequired,
      });
      return;
    }

    // Expiry payload logic — the same end-of-day rule the bulk bar uses.
    const expiresAt =
      form.enableExpiry && form.expiresDate
        ? expiryInstant(form.expiresDate, form.expiresTime)
        : null;

    try {
      const updated = await updateLink(clientId, {
        newCode: form.code !== code ? form.code : undefined,
        originalUrl: form.url.trim(),
        expiresAt,
        password,
      });
      toast.success('تم حفظ التعديلات بنجاح');
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تحديث الرَّابط.';
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
        form.url.trim() &&
        !slugTooShort &&
        hasChanges
      ) {
        handleSubmit();
      }
    }
  };

  const remainingTimeBadge = useMemo(() => {
    if (!form.enableExpiry || !form.expiresDate) return null;
    return formatRemainingTime(form.expiresDate, form.expiresTime);
  }, [form.enableExpiry, form.expiresDate, form.expiresTime]);

  const slugTooShort = form.code.trim().length < 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open && (
        <DialogContent
          dir="rtl"
          onKeyDown={handleKeyDown}
          className="sm:max-w-xl w-[calc(100%-2rem)] mx-auto p-0 gap-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-border/80 dark:border-neutral-800/90 bg-background dark:bg-neutral-950 shadow-2xl dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)] transition-safe duration-300 max-h-[calc(100dvh_-_3rem)] flex flex-col"
        >
          {/* Top Decorative Ambient Accent */}
          <div
            className="h-1.5 w-full bg-linear-to-r from-primary/30 via-primary to-primary/30 shrink-0"
            aria-hidden="true"
          />

          {/* Dialog Header */}
          <DialogHeader
            data-visual="link-edit-header"
            className="px-6 py-4.5 sm:px-7 sm:py-5 text-start border-b border-border/50 dark:border-neutral-800/80 bg-muted/20 dark:bg-neutral-900/40 shrink-0"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs shrink-0 flex items-center justify-center">
                  <Pencil className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                </div>
                <div>
                  <DialogTitle
                    data-visual="link-edit-title"
                    className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
                  >
                    <span>{LINK_EDIT_DIALOG_COPY.title}</span>
                    {hasChanges && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        تعديلات معلقة
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription
                    data-visual="link-edit-description"
                    className="text-xs text-muted-foreground mt-0.5"
                  >
                    {LINK_EDIT_DIALOG_COPY.description}
                  </DialogDescription>
                </div>
              </div>

              {hasChanges && (
                <button
                  type="button"
                  onClick={resetFormState}
                  title="إعادة تعيين القيم الأصلية"
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-neutral-800 border border-transparent hover:border-border/60 transition-safe cursor-pointer"
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
            <div className="p-3.5 rounded-2xl bg-muted/40 dark:bg-neutral-900/60 border border-border/70 dark:border-neutral-800/80 space-y-2.5 transition-safe">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  <span>معاينة الرَّابط المباشر</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {form.passwordEnabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                      <ShieldCheck className="w-3 h-3" />
                      محمي
                    </span>
                  )}
                  {form.enableExpiry && remainingTimeBadge && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
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
                    <span className="text-primary">{form.code || '...'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0" dir="ltr">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="نسخ الرَّابط المختصر"
                    aria-label="نسخ الرَّابط المختصر"
                  >
                    {form.copied ? (
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
                  <span>{LINK_EDIT_DIALOG_COPY.urlLabel}</span>
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
                    <span>اختبار الرَّابط</span>
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
                  value={form.url}
                  onChange={(e) => dispatch({ type: 'urlChanged', url: e.target.value })}
                  placeholder="https://example.com/very-long-target-url"
                  className="w-full h-11 px-3.5 rounded-xl border border-border/70 dark:border-neutral-800 bg-background dark:bg-neutral-950 text-sm font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-safe duration-200 shadow-xs"
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
                  <span>{LINK_EDIT_DIALOG_COPY.slugLabel}</span>
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {form.code.length}/16
                </span>
              </div>

              <div
                className={cn(
                  'flex items-center w-full overflow-hidden bg-background dark:bg-neutral-950 border rounded-xl transition-safe duration-200 shadow-xs',
                  slugStatus === 'taken'
                    ? 'border-destructive/60'
                    : slugStatus === 'available' && form.code !== code
                      ? 'border-emerald-500/60'
                      : 'border-border/70 dark:border-neutral-800'
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
                  value={form.code}
                  onChange={(e) => dispatch({ type: 'codeChanged', code: e.target.value })}
                  maxLength={16}
                  placeholder="custom-slug"
                  className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm font-mono font-bold focus:outline-none text-foreground placeholder:text-muted-foreground/30"
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
                    {LINK_EDIT_DIALOG_COPY.slugChecking}
                  </span>
                ) : slugStatus === 'available' ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {form.code === code
                      ? LINK_EDIT_DIALOG_COPY.slugCurrent
                      : LINK_EDIT_DIALOG_COPY.slugAvailable}
                  </span>
                ) : slugStatus === 'taken' ? (
                  <span className="text-destructive flex items-center gap-1.5">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {slugError || LINK_EDIT_DIALOG_COPY.slugTaken}
                  </span>
                ) : slugStatus === 'offline' ? (
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {LINK_EDIT_DIALOG_COPY.slugOffline}
                  </span>
                ) : (
                  <span className="text-muted-foreground/70">{LINK_EDIT_DIALOG_COPY.slugHint}</span>
                )}
              </div>
            </div>

            {/* Section: Expiry & Security Cards */}
            <div className="space-y-3.5 pt-2">
              {/* Expiration Settings Card */}
              <div
                className={cn(
                  'rounded-2xl border transition-safe duration-200 overflow-hidden',
                  form.enableExpiry
                    ? 'border-primary/30 bg-primary/5 dark:bg-primary/2'
                    : 'border-border/70 dark:border-neutral-800/80 bg-muted/20 dark:bg-neutral-900/30'
                )}
              >
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-xl border shrink-0 transition-colors',
                        form.enableExpiry
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted dark:bg-neutral-800 text-muted-foreground border-border/50'
                      )}
                    >
                      <CalendarClock className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">
                        {LINK_EDIT_DIALOG_COPY.expiryTitle}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        تعطيل الرَّابط تلقائياً بعد حلول هذا الموعد
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.enableExpiry}
                    aria-label="تفعيل أو تعطيل انتهاء صلاحية الرَّابط"
                    onClick={() =>
                      dispatch({ type: 'expiryToggled', fallback: defaultExpiryParts() })
                    }
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      form.enableExpiry
                        ? 'bg-primary border-primary'
                        : 'bg-muted-foreground/20 border-border dark:bg-neutral-800'
                    )}
                    dir="ltr"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200',
                        form.enableExpiry ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {form.enableExpiry && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/40 dark:border-neutral-800/60 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Quick Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-bold text-muted-foreground ml-1">
                        خيارات سريعة:
                      </span>
                      <button
                        type="button"
                        onClick={() => addHoursPreset(24)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-background dark:bg-neutral-900 border border-border/60 hover:border-primary/40 hover:text-primary transition-safe cursor-pointer"
                      >
                        24 ساعة
                      </button>
                      <button
                        type="button"
                        onClick={() => addHoursPreset(24 * 7)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-background dark:bg-neutral-900 border border-border/60 hover:border-primary/40 hover:text-primary transition-safe cursor-pointer"
                      >
                        7 أيام
                      </button>
                      <button
                        type="button"
                        onClick={() => addHoursPreset(24 * 30)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-background dark:bg-neutral-900 border border-border/60 hover:border-primary/40 hover:text-primary transition-safe cursor-pointer"
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
                          value={form.expiresDate}
                          onChange={(date) => dispatch({ type: 'expiryDateChanged', date })}
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
                        <TimePicker
                          value={form.expiresTime}
                          onChange={(time) => dispatch({ type: 'expiryTimeChanged', time })}
                          aria-label="وقت انتهاء الصلاحية"
                          triggerClassName="h-10 text-xs flex-1"
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Password Protection Card */}
              <div
                className={cn(
                  'rounded-2xl border transition-safe duration-200 overflow-hidden',
                  form.passwordEnabled
                    ? 'border-primary/30 bg-primary/5 dark:bg-primary/2'
                    : 'border-border/70 dark:border-neutral-800/80 bg-muted/20 dark:bg-neutral-900/30'
                )}
              >
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-xl border shrink-0 transition-colors',
                        form.passwordEnabled
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted dark:bg-neutral-800 text-muted-foreground border-border/50'
                      )}
                    >
                      <KeyRound className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">
                        {LINK_EDIT_DIALOG_COPY.passwordTitle}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        طلب رمز أمان سري قبل التوجيه إلى الرَّابط الأصلي
                      </p>
                    </div>
                  </div>

                  <button
                    id="edit-password-toggle"
                    type="button"
                    role="switch"
                    aria-checked={form.passwordEnabled}
                    aria-label="تفعيل أو تعطيل الحماية بكلمة مرور"
                    onClick={() => dispatch({ type: 'passwordToggled' })}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      form.passwordEnabled
                        ? 'bg-primary border-primary'
                        : 'bg-muted-foreground/20 border-border dark:bg-neutral-800'
                    )}
                    dir="ltr"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200',
                        form.passwordEnabled ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {form.passwordEnabled && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/40 dark:border-neutral-800/60 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    {currentPasswordProtected && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>
                          الرَّابط محمي حالياً بكلمة مرور. اتركه فارغاً للإبقاء عليها، أو اكتب كلمة
                          مرور جديدة لتغييرها.
                        </span>
                      </div>
                    )}

                    <div className="relative">
                      <input
                        id="edit-password-input"
                        type={form.showPassword ? 'text' : 'password'}
                        value={form.password}
                        dir="ltr"
                        onChange={(e) =>
                          dispatch({ type: 'passwordChanged', password: e.target.value })
                        }
                        placeholder={
                          currentPasswordProtected
                            ? LINK_EDIT_DIALOG_COPY.passwordKeepPlaceholder
                            : LINK_EDIT_DIALOG_COPY.passwordPlaceholder
                        }
                        autoComplete="new-password"
                        aria-invalid={form.passwordError ? true : undefined}
                        aria-describedby={form.passwordError ? 'edit-password-error' : undefined}
                        className="w-full h-10 pr-3.5 pl-10 rounded-xl border border-border/70 dark:border-neutral-800 bg-background dark:bg-neutral-950 text-xs font-medium text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-safe duration-200 shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'passwordVisibilityToggled' })}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 cursor-pointer"
                        title={form.showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        aria-label={form.showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {form.showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {form.passwordError && (
                      <p
                        id="edit-password-error"
                        role="alert"
                        className="text-xs font-medium text-destructive flex items-center gap-1.5"
                      >
                        <CircleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {form.passwordError}
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
                <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="flex-1">{updateError}</span>
              </div>
            )}

            {/* Footer Action Buttons */}
            <DialogActions
              onCancel={onClose}
              cancelLabel={LINK_EDIT_DIALOG_COPY.cancel}
              className="pt-4 sm:pt-5 border-t border-border/50 dark:border-neutral-800/80"
              leading={
                <div className="text-[11px] text-muted-foreground/80 hidden sm:block">
                  اضغط{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Ctrl</kbd> +{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Enter</kbd>{' '}
                  للحفظ السريع
                </div>
              }
            >
              <HeroCtaButton
                type="submit"
                disabled={
                  updateLoading ||
                  slugStatus === 'taken' ||
                  slugStatus === 'checking' ||
                  slugTooShort ||
                  !hasChanges
                }
                className="w-full sm:w-auto"
              >
                {updateLoading ? (
                  <>
                    <LoaderCircle className="w-4 h-4 animate-spin opacity-90" aria-hidden="true" />
                    <span>{LINK_EDIT_DIALOG_COPY.saving}</span>
                  </>
                ) : (
                  <span>{LINK_EDIT_DIALOG_COPY.save}</span>
                )}
              </HeroCtaButton>
            </DialogActions>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
});
