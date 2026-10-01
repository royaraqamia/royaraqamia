'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Copy } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';

interface LeadSuccessPanelProps {
  /** The Reference Code the applicant quotes on WhatsApp. */
  referenceCode: string;
  title?: string;
  message: string;
  className?: string;
}

/**
 * The confirmation every public intake flow shows once its lead is recorded.
 *
 * It leads with the Reference Code because that is the whole point of minting
 * one: the applicant cannot quote a code they were never shown. Keeping it in
 * one component means all four flows tell the same story.
 */
export function LeadSuccessPanel({
  referenceCode,
  title = 'تمَّ استلام طلبك بنجاح!',
  message,
  className,
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
    </div>
  );
}
