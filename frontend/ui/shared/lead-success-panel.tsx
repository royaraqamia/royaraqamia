'use client';

import { useState } from 'react';
import { Check, CheckCircle2, ClipboardList, Copy, LogIn, RefreshCw } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';

interface LeadSuccessPanelProps {
  /** The Reference Code the applicant quotes on WhatsApp. */
  referenceCode: string;
  title?: string;
  message: string;
  className?: string;
  /** Whether a session was present when the form rendered. */
  isAuthenticated?: boolean;
  /**
   * Whether this receipt was restored after a refresh rather than shown right
   * after submitting — so the panel can reassure rather than re-announce.
   */
  restored?: boolean;
  /** Starts a fresh submission, clearing the remembered receipt. */
  onStartOver?: () => void;
}

/**
 * The confirmation every public intake flow shows once its lead is recorded.
 *
 * It leads with the Reference Code because that is the whole point of minting
 * one: the applicant cannot quote a code they were never shown. Keeping it in
 * one component means all four flows tell the same story.
 *
 * It also points at where the submission can be corrected later. Editing needs
 * an account, so the bridge is honest about that: a signed-in submitter is sent
 * straight to `طلباتي`, an anonymous one to sign in first.
 */
export function LeadSuccessPanel({
  referenceCode,
  title = 'تمَّ استلام طلبك بنجاح!',
  message,
  className,
  isAuthenticated = false,
  restored = false,
  onStartOver,
}: LeadSuccessPanelProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn('p-6 sm:p-10 text-center', className)} role="status">
      <CheckCircle2 className="mx-auto mb-5 size-12 text-emerald-600" aria-hidden="true" />

      <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">{title}</h2>

      <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
        {message}
      </p>

      <div className="mt-6 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/40 p-3 ps-4">
        <div className="min-w-0 text-start">
          <p className="text-xs text-muted-foreground font-medium">رقم الطَّلب</p>
          <p className="mt-0.5 font-mono text-base font-bold tracking-wider text-primary wrap-anywhere">
            {referenceCode}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void copy()}
          className="relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-safe duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary cursor-pointer active:scale-95"
          aria-label="نسخ رقم الطَّلب"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-bold">تمَّ النَّسخ</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>نسخ</span>
            </>
          )}
        </button>
      </div>

      {restored && (
        <p className="mt-4 text-xs font-medium text-muted-foreground" role="status">
          استعدنا رقم طلبك المحفوظ على هذا الجهاز — احتفظ به.
        </p>
      )}

      {/* The bridge to the account edit path. Editing needs an account, so the
          copy is scoped to whether one is present rather than promising an
          anonymous visitor something they cannot do. */}
      <div className="mt-6 border-t border-border/50 pt-5">
        {isAuthenticated ? (
          <a
            href="/account/submissions"
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-bold text-primary transition-safe duration-200 hover:border-primary/50 hover:bg-primary/15"
          >
            <ClipboardList className="size-4" aria-hidden="true" />
            عدِّل طلبك من «طلباتي»
          </a>
        ) : (
          <p className="mx-auto max-w-md text-xs text-muted-foreground leading-relaxed">
            <LogIn className="mx-1 inline size-3.5 align-text-bottom" aria-hidden="true" />
            لتعديل هذا الطلب لاحقًا، أنشئ حسابًا ثم أعِد إرساله وأنت مسجَّل الدُّخول؛ عندها يظهر في
            <a
              href="/account/submissions"
              className="mx-1 font-bold text-primary hover:underline underline-offset-4"
            >
              طلباتي
            </a>
            .
          </p>
        )}

        {onStartOver && (
          <button
            type="button"
            onClick={onStartOver}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            إرسال طلب جديد
          </button>
        )}
      </div>
    </div>
  );
}
