'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  Phone,
  ReceiptText,
  UserRound,
} from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  REGION_LABELS,
  type AvailabilitySlot,
  type ConsultationPackage,
  type ConsultationPaymentMethod,
  type ConsultationRegion,
  type ConsultationSettings,
} from '@/shared/contracts/consultation';
import { formatSessionDualLine } from '@/frontend/shared/consultation-time';
import { cn } from '@/frontend/shared/cn';

interface PaymentStepProps {
  pkg: ConsultationPackage;
  sessions: AvailabilitySlot[];
  region: ConsultationRegion;
  paymentMethod: ConsultationPaymentMethod;
  onPaymentMethodChange: (method: ConsultationPaymentMethod) => void;
  settings: Partial<ConsultationSettings>;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (e.g. insecure context) — legacy fallback.
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  }
}

function ShamcashCard({ settings }: { settings: Partial<ConsultationSettings> }) {
  const code = settings.payment_shamcash_code ?? '';
  const [copied, setCopied] = useState(false);

  // Reset the "copied" affordance shortly after it appears.
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    if (!code) return;
    if (await copyText(code)) setCopied(true);
  }

  return (
    <div className="rounded-2xl border-2 border-primary/40 bg-card p-6 space-y-4">
      <div className="flex items-center gap-2 text-primary font-bold">
        <ReceiptText className="size-5" />
        <span>الدفع عبر ShamCash</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        انسخ رمز الإيصال التالي والصقه في تطبيق ShamCash لإتمام التحويل، ثم أرسل صورة الإيصال عبر
        واتساب لتأكيد الحجز.
      </p>

      <div className="flex items-center gap-2">
        <code
          dir="ltr"
          className="flex-1 min-w-0 rounded-xl border border-border bg-muted px-4 py-3 font-mono text-sm sm:text-base text-foreground break-all select-all"
        >
          {code || '—'}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!code}
          aria-label={copied ? 'تم النسخ' : 'نسخ الرمز'}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
            copied
              ? 'bg-emerald-500 text-white'
              : 'border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
          )}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>

      <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
        <li>افتح تطبيق ShamCash واختر «تحويل عبر الرمز».</li>
        <li>الصق الرمز المنسوخ وأكمل المبلغ المطلوب.</li>
        <li>أرسل صورة إيصال النجاح عبر واتساب.</li>
      </ol>
    </div>
  );
}

function MoneygramCard({ settings }: { settings: Partial<ConsultationSettings> }) {
  const rows = [
    { icon: UserRound, label: 'اسم المستفيد', value: settings.payment_moneygram_name },
    { icon: Phone, label: 'رقم الهاتف', value: settings.payment_moneygram_phone },
    { icon: Landmark, label: 'الفرع المفضّل', value: settings.payment_moneygram_branch },
  ];

  return (
    <div className="rounded-2xl border-2 border-primary/40 bg-card p-6 space-y-4">
      <div className="flex items-center gap-2 text-primary font-bold">
        <CreditCard className="size-5" />
        <span>الدفع عبر MoneyGram</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        حوّل المبلغ عبر MoneyGram إلى البيانات التالية بدقة، ثم أرسل صورة الإيصال عبر واتساب لتأكيد
        الحجز.
      </p>
      <dl className="space-y-2">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
            <Icon className="size-4 text-primary shrink-0" aria-hidden="true" />
            <dt className="text-sm text-muted-foreground shrink-0">{label}:</dt>
            <dd className="text-sm font-bold text-foreground break-all" dir="auto">
              {value || '—'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Building2 className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        تأكد من تطابق الاسم حرفيًا عند الإرسال حتى نتمكن من استلام الحوالة.
      </p>
    </div>
  );
}

export function PaymentStep({
  pkg,
  sessions,
  region,
  paymentMethod,
  onPaymentMethodChange,
  settings,
  submitting,
  error,
  onConfirm,
}: PaymentStepProps) {
  const methods: ConsultationPaymentMethod[] = ['shamcash', 'moneygram'];
  const isShamcash = paymentMethod === 'shamcash';

  return (
    <div className="space-y-5">
      {/* Order summary */}
      <div className="rounded-2xl border border-border bg-muted/60 p-5 space-y-2">
        <h4 className="font-bold text-foreground mb-1">ملخّص الحجز</h4>
        <p className="text-sm text-muted-foreground">
          الباقة: <span className="text-foreground font-medium">{pkg.name}</span> —{' '}
          {pkg.sessions_count === 1 ? 'جلسة واحدة' : `${pkg.sessions_count} جلسات`} ×{' '}
          {pkg.duration_minutes} دقيقة
        </p>
        <ul className="text-sm space-y-1 text-muted-foreground">
          {sessions.map((slot) => (
            <li key={slot.id}>• {formatSessionDualLine(slot).localLine}</li>
          ))}
        </ul>
        <p className="pt-2 text-lg font-black text-foreground">
          الإجمالي:{' '}
          <span className="bg-linear-to-l from-purple-500 to-indigo-400 bg-clip-text text-transparent">
            ${pkg.price_usd}
          </span>
        </p>
      </div>

      {/* Method switcher */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="طريقة الدفع">
        {methods.map((method) => (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={paymentMethod === method}
            onClick={() => onPaymentMethodChange(method)}
            className={cn(
              'rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-all duration-200 cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
              paymentMethod === method
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/50'
            )}
          >
            {PAYMENT_METHOD_LABELS[method]}
          </button>
        ))}
      </div>

      {isShamcash ? <ShamcashCard settings={settings} /> : <MoneygramCard settings={settings} />}

      <p className="text-xs text-muted-foreground">
        الطريقة المعروضة تلقائيًا وفق اختيارك «{REGION_LABELS[region]}» — يمكنك التبديل يدويًا أعلاه
        إن رغبت.
      </p>

      {error && (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={submitting}
        onClick={onConfirm}
        className={cn(
          'w-full h-14 rounded-full text-lg font-bold text-primary-foreground',
          'bg-linear-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:via-indigo-500 hover:to-purple-500',
          'shadow-xl shadow-purple-900/30 transition-all duration-300 active:scale-[0.98] cursor-pointer',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
          submitting && 'opacity-70 cursor-wait'
        )}
      >
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="size-5 animate-spin" />
            جارٍ إنشاء الحجز...
          </span>
        ) : (
          'تأكيد الحجز ومتابعة الدفع'
        )}
      </button>
    </div>
  );
}
