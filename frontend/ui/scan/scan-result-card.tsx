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
import { contactName, truncateForDisplay, type ScanClassification } from '@/shared/contracts/scan';
import { SCAN_COPY } from './scan-copy';
import { scanActionLabel, scanKindLabel } from './scan-labels';

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
      { icon: Wifi, label: SCAN_COPY.wifiNetwork, value: ssid },
      ...(password
        ? [{ icon: KeyRound, label: SCAN_COPY.wifiPassword, value: password, ltr: true }]
        : []),
      ...(encryption
        ? [{ icon: ShieldAlert, label: SCAN_COPY.wifiEncryption, value: encryption, ltr: true }]
        : []),
      ...(hidden ? [{ icon: Wifi, label: SCAN_COPY.wifiHidden, value: SCAN_COPY.yes }] : []),
    ];
  }

  if (classification.otp) {
    const { issuer, label, type, secret } = classification.otp;
    return [
      ...(issuer ? [{ icon: KeyRound, label: SCAN_COPY.otpIssuer, value: issuer }] : []),
      ...(label ? [{ icon: KeyRound, label: SCAN_COPY.otpAccount, value: label }] : []),
      { icon: KeyRound, label: SCAN_COPY.otpType, value: type, ltr: true },
      { icon: KeyRound, label: SCAN_COPY.otpSecret, value: secret, ltr: true },
    ];
  }

  if (classification.kind === 'contact') {
    const name = contactName(classification.value);
    return name ? [{ icon: Contact, label: SCAN_COPY.contactName, value: name }] : [];
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
    <Card data-visual="result-card">
      <CardContent className="flex flex-col gap-4">
        <div data-visual="result-badges" className="flex flex-wrap items-center gap-2">
          <Badge variant="glow" className="gap-1.5">
            <KindIcon className="size-3.5" />
            {scanKindLabel(classification.kind)}
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
            <div
              data-visual="result-payload"
              className="rounded-xl border border-border/60 bg-muted/40 p-3"
            >
              <pre
                dir="auto"
                className="max-h-40 overflow-auto text-start font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground"
              >
                {truncateForDisplay(classification.value)}
              </pre>
            </div>

            {classification.host && (
              <p className="text-xs text-muted-foreground">
                {SCAN_COPY.destination}{' '}
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
                {SCAN_COPY.deceptive}
              </p>
            )}

            {classification.refusedScheme && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {SCAN_COPY.refusedScheme.replace('{scheme}', classification.refusedScheme)}
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
                      label={SCAN_COPY.copyRow.replace('{label}', row.label)}
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
            {SCAN_COPY.verifying}
          </p>
        )}

        {certificate.status === 'unavailable' && (
          <p className="text-xs text-muted-foreground">
            {SCAN_COPY.certificateUnavailable}
            {certificate.message ? ` (${certificate.message})` : ''}. {SCAN_COPY.certificateHint}
          </p>
        )}

        <div data-visual="result-actions" className="flex flex-wrap items-center gap-2">
          {classification.actionHref && classification.actionLabel && (
            <Button asChild>
              <a
                href={classification.actionHref}
                {...(isExternalLink
                  ? { target: '_blank', rel: 'noopener noreferrer external' }
                  : {})}
              >
                {scanActionLabel(classification.actionHref)}
                {isExternalLink && <ExternalLink />}
              </a>
            </Button>
          )}

          <Button
            data-visual="result-copy"
            type="button"
            variant="outline"
            onClick={() => void copy(classification.value)}
          >
            {copied === classification.value ? <Check className="text-emerald-600" /> : <Copy />}
            {SCAN_COPY.copy}
          </Button>

          <Button data-visual="result-rescan" type="button" variant="ghost" onClick={onRescan}>
            <RefreshCw />
            {SCAN_COPY.rescan}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
