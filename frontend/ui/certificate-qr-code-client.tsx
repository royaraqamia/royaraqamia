'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/frontend/shared/cn';
import { Loader2, ShieldCheck, QrCode } from 'lucide-react';

interface CertificateQRCodeClientProps {
  code: string;
  baseUrl?: string;
  size?: number;
  className?: string;
}

export function CertificateQRCodeClient({
  code,
  baseUrl = 'https://royaraqamia.com',
  size = 200,
  className,
}: CertificateQRCodeClientProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${baseUrl}/verify/${encodeURIComponent(code)}`;
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toString(url, {
          type: 'svg',
          width: size,
          margin: 2,
          color: {
            dark: '#ffffff',
            light: '#00000000',
          },
          errorCorrectionLevel: 'M',
        })
      )
      .then((value) => {
        if (!cancelled) setSvg(value);
      });
    return () => {
      cancelled = true;
    };
  }, [code, baseUrl, size]);

  if (!svg) {
    return (
      <div
        role="status"
        aria-label="Generating Certificate QR Code"
        className={cn(
          'group relative inline-flex max-w-full flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 p-5 shadow-2xl backdrop-blur-2xl transition-all duration-300 ease-out',
          className
        )}
      >
        {/* Subtle Ambient Loading Shimmer */}
        <div className="absolute inset-0 bg-linear-to-tr from-cyan-500/5 via-indigo-500/5 to-purple-500/5 animate-pulse" />
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/15 to-transparent" />

        {/* Skeleton Badge Placeholder */}
        <div className="relative z-10 mb-3 flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-neutral-400">
          <div className="size-1.5 rounded-full bg-neutral-600 animate-pulse" />
          <div className="h-3 w-24 rounded bg-neutral-800 animate-pulse" />
        </div>

        {/* Loading Spinner Container */}
        <div
          className="relative z-10 flex items-center justify-center rounded-2xl border border-white/10 bg-neutral-900/90 p-3 shadow-inner backdrop-blur-md"
          style={{ width: size, height: size }}
        >
          <div className="absolute inset-0 rounded-2xl bg-linear-to-r from-cyan-500/10 to-indigo-500/10 opacity-50 blur-sm" />
          <Loader2 className="relative z-10 size-7 animate-spin text-cyan-400" />
        </div>

        {/* Skeleton Code Footer */}
        <div className="relative z-10 mt-3 flex items-center gap-1.5">
          <div className="h-6 w-32 rounded-lg border border-white/5 bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      role="figure"
      aria-label={`Verification QR code for certificate code ${code}`}
      className={cn(
        'group relative inline-flex max-w-full flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 p-5 shadow-2xl shadow-black/80 backdrop-blur-2xl transition-all duration-300 ease-out hover:scale-[1.01] hover:border-white/20 hover:shadow-cyan-500/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950',
        className
      )}
    >
      {/* Dynamic Ambient Glow Effect on Hover */}
      <div className="pointer-events-none absolute -inset-px rounded-3xl bg-linear-to-r from-cyan-500/10 via-indigo-500/10 to-purple-500/10 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

      {/* Top Specular Edge Highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />

      {/* Trust & Security Header Pill */}
      <div className="relative z-10 mb-3 flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 backdrop-blur-md">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        <ShieldCheck className="size-3 shrink-0 text-emerald-400" />
        <span>شهادة مُوثَّقة</span>
      </div>

      {/* QR Code Precision Canvas Frame */}
      <div className="relative z-10 rounded-2xl border border-white/10 bg-neutral-900/90 p-3 shadow-inner backdrop-blur-md transition-all duration-300 group-hover:border-white/20 group-hover:bg-neutral-900">
        {/* Decorative Target Reticle Corners */}
        <div className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 rounded-tl-sm border-l-2 border-t-2 border-cyan-400/40 transition-colors duration-300 group-hover:border-cyan-400" />
        <div className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-tr-sm border-r-2 border-t-2 border-cyan-400/40 transition-colors duration-300 group-hover:border-cyan-400" />
        <div className="pointer-events-none absolute bottom-2 left-2 h-2.5 w-2.5 rounded-bl-sm border-b-2 border-l-2 border-cyan-400/40 transition-colors duration-300 group-hover:border-cyan-400" />
        <div className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 rounded-br-sm border-b-2 border-r-2 border-cyan-400/40 transition-colors duration-300 group-hover:border-cyan-400" />

        {/* QR Code SVG Display Wrapper */}
        <div
          className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.01] [&>svg]:block [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:rounded-lg"
          style={{ width: size, height: size }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Dynamic Metadata Badge */}
      <div className="relative z-10 mt-3 flex max-w-full items-center gap-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-mono tracking-wider text-neutral-300 transition-colors duration-300 group-hover:border-white/20 group-hover:bg-white/10">
          <QrCode className="size-3 shrink-0 text-neutral-400" />
          <span className="max-w-45 truncate" title={code}>
            {code}
          </span>
        </div>
      </div>
    </div>
  );
}
