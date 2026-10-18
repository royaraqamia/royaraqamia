'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import {
  Check,
  Contact,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  Type,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import type { ScannedCertificateState } from '@/frontend/state/scan/use-scanned-certificate';
import {
  SCAN_RESULT_KIND_LABELS,
  contactName,
  truncateForDisplay,
  type ScanClassification,
} from '@/shared/contracts/scan';

/**
 * The Certificate card belongs to the verify surface and drags its motion
 * machinery with it, but only one narrow payload ever needs it — a scan of our
 * own `/verify/<code>` link. Loading it lazily keeps that weight out of the
 * Scanner's first paint, which the route's budget enforces.
 */
const CertificateResultCard = dynamic(
  tolerateChunkFailure('certificate result card', () =>
    import('@/frontend/ui/verify/certificate-result-card').then((mod) => ({
      default: mod.CertificateResultCard,
    }))
  ),
  { ssr: false }
);

const KIND_ICONS: Record<ScanClassification['kind'], LucideIcon> = {
  link: Link2,
  email: Mail,
  phone: Phone,
  sms: MessageSquare,
  wifi: Wifi,
  contact: Contact,
  location: MapPin,
  otp: KeyRound,
  text: Type,
};

interface DetailRow {
  icon: LucideIcon;
  label: string;
  value: string;
  ltr?: boolean;
}

/** The per-kind rows that carry the payload's own fields, not a destination. */
function detailRows(classification: ScanClassification): DetailRow[] {
  if (classification.wifi) {
    const { ssid, password, encryption, hidden } = classification.wifi;
    return [
      { icon: Wifi, label: 'اسم الشَّبكة', value: ssid },
      ...(password ? [{ icon: KeyRound, label: 'كلمة المرور', value: password, ltr: true }] : []),
      ...(encryption
        ? [{ icon: ShieldAlert, label: 'نوع التَّشفير', value: encryption, ltr: true }]
        : []),
      ...(hidden ? [{ icon: Wifi, label: 'شبكة مخفيَّة', value: 'نعم' }] : []),
    ];
  }

  if (classification.otp) {
    const { issuer, label, type, secret } = classification.otp;
    return [
      ...(issuer ? [{ icon: KeyRound, label: 'الجهة', value: issuer }] : []),
      ...(label ? [{ icon: KeyRound, label: 'الحساب', value: label }] : []),
      { icon: KeyRound, label: 'النَّوع', value: type, ltr: true },
      { icon: KeyRound, label: 'المفتاح السِّرِّي', value: secret, ltr: true },
    ];
  }

  if (classification.kind === 'contact') {
    const name = contactName(classification.value);
    return name ? [{ icon: Contact, label: 'الاسم', value: name }] : [];
  }

  return [];
}

function CopyButton({
  value,
  label,
  copied,
  onCopy,
}: {
  value: string;
  label: string;
  copied: string | null;
  onCopy: (value: string) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={() => onCopy(value)}
    >
      {copied === value ? <Check className="text-emerald-600" /> : <Copy />}
    </Button>
  );
}

export function ScanResultCard({
  classification,
  formatLabel,
  certificate,
  onRescan,
}: {
  classification: ScanClassification;
  formatLabel: string;
  certificate: ScannedCertificateState;
  onRescan: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const KindIcon = KIND_ICONS[classification.kind];
  const rows = detailRows(classification);
  const isExternalLink = Boolean(classification.actionHref?.startsWith('http'));

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((current) => (current === value ? null : current)), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="glow" className="gap-1.5">
            <KindIcon className="size-3.5" />
            {SCAN_RESULT_KIND_LABELS[classification.kind]}
          </Badge>
          <Badge variant="outline" dir="ltr">
            {formatLabel}
          </Badge>
        </div>

        {certificate.status === 'ok' ? (
          <CertificateResultCard
            certificate={certificate.certificate}
            copied={copied === certificate.certificate.certificate_code}
            onCopy={(value) => void copy(value)}
          />
        ) : (
          <>
            <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
              <pre
                dir="auto"
                className="max-h-40 overflow-auto text-start font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground"
              >
                {truncateForDisplay(classification.value)}
              </pre>
            </div>

            {classification.host && (
              <p className="text-xs text-muted-foreground">
                الوجهة الحقيقيَّة:{' '}
                <span dir="ltr" className="font-mono font-semibold text-foreground">
                  {classification.host}
                </span>
              </p>
            )}

            {classification.deceptive && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                هذا الرَّابط يخفي وجهته الحقيقيَّة: نطاق مُشابه أو معلومات دخول مضمَّنة. لا تُدخِل
                عليه أيَّ بيانات.
              </p>
            )}

            {classification.refusedScheme && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                الماسح لا يفتح روابط من نوع «{classification.refusedScheme}» لأنَّها قد تُنفِّذ
                أوامر على جهازك.
              </p>
            )}

            {rows.length > 0 && (
              <dl className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center gap-3 p-3">
                    <row.icon className="size-4 shrink-0 text-muted-foreground" />
                    <dt className="w-28 shrink-0 text-xs text-muted-foreground">{row.label}</dt>
                    <dd
                      dir={row.ltr ? 'ltr' : 'auto'}
                      className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                    >
                      {row.value}
                    </dd>
                    <CopyButton
                      value={row.value}
                      label={`نسخ ${row.label}`}
                      copied={copied}
                      onCopy={(value) => void copy(value)}
                    />
                  </div>
                ))}
              </dl>
            )}
          </>
        )}

        {certificate.status === 'loading' && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="size-3.5 animate-spin" />
            جاري التَّحقُّق من الشَّهادة…
          </p>
        )}

        {certificate.status === 'unavailable' && (
          <p className="text-xs text-muted-foreground">
            تعذَّر جلب بيانات الشَّهادة الآن
            {certificate.message ? ` (${certificate.message})` : ''}. يمكنك فتح الرَّابط للتَّحقُّق
            مباشرة.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {classification.actionHref && classification.actionLabel && (
            <Button asChild>
              <a
                href={classification.actionHref}
                {...(isExternalLink
                  ? { target: '_blank', rel: 'noopener noreferrer external' }
                  : {})}
              >
                {classification.actionLabel}
                {isExternalLink && <ExternalLink />}
              </a>
            </Button>
          )}

          <Button type="button" variant="outline" onClick={() => void copy(classification.value)}>
            {copied === classification.value ? <Check className="text-emerald-600" /> : <Copy />}
            نسخ المحتوى
          </Button>

          <Button type="button" variant="ghost" onClick={onRescan}>
            <RefreshCw />
            مسح رمز آخر
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
