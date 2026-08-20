'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { getShortLinkUrl } from '@/frontend/shared/linksnap/get-short-link-url';
import { cn } from '@/frontend/shared/cn';
import { Loader2, Download, AlertCircle, RotateCcw, QrCode } from 'lucide-react';
import { logger } from '@/frontend/shared/logger';
import { hslToHex } from '@/frontend/shared/hsl-to-hex';

interface LinkQrModalProps {
  code: string;
  baseUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkQrModal({ code, baseUrl, open, onOpenChange }: LinkQrModalProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [generationKey, setGenerationKey] = useState(0);

  const shortUrl = getShortLinkUrl(baseUrl, code);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(false);

    const style = getComputedStyle(document.documentElement);
    const dark = hslToHex(style.getPropertyValue('--foreground').trim());
    const light = hslToHex(style.getPropertyValue('--background').trim());

    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toString(shortUrl, {
          type: 'svg',
          width: 240,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: dark ?? '#000000', light: light ?? '#ffffff' },
        })
      )
      .then((value) => {
        if (!cancelled) setSvg(value);
      })
      .catch((err: unknown) => {
        logger.error('QR generation failed', { error: String(err) });
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open, shortUrl, generationKey]);

  const handleDownload = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linksnap-${code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-105 p-6 gap-6 rounded-3xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl transition-transform">
        <DialogHeader className="space-y-3 text-right">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/15 shadow-xs">
              <QrCode className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                رمز الـ QR
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                امسح الرَّمز لعرض الرَّابط
              </DialogDescription>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-xs backdrop-blur-xs">
            <span className="text-muted-foreground shrink-0 font-medium">الرَّابط:</span>
            <span
              dir="ltr"
              className="font-mono text-xs font-semibold text-foreground truncate max-w-60 text-left select-all hover:text-primary transition-colors"
              title={shortUrl}
            >
              {shortUrl}
            </span>
          </div>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center w-full">
          <div className="relative group w-full flex flex-col items-center justify-center min-h-70 rounded-2xl border border-border/60 bg-linear-to-b from-muted/20 via-muted/40 to-muted/20 p-6 transition-all duration-300">
            {svg ? (
              <div className="flex flex-col items-center gap-5 w-full animate-in fade-in-50 zoom-in-95 duration-200">
                <div
                  className="rounded-2xl border border-border/80 bg-background p-4 shadow-sm transition-all duration-300 group-hover:scale-[1.01] group-hover:shadow-md [&>svg]:w-48 [&>svg]:h-48 [&>svg]:max-w-full [&>svg]:rounded-lg"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <button
                  type="button"
                  onClick={handleDownload}
                  className={cn(
                    'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-xs text-primary-foreground',
                    'bg-primary shadow-md shadow-primary/15 hover:bg-primary/95 hover:shadow-lg hover:shadow-primary/25',
                    'transition-all duration-200 ease-out cursor-pointer active:scale-[0.98]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                  aria-label="تحميل الرَّمز بصيغة SVG"
                >
                  <Download
                    aria-hidden="true"
                    className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5"
                  />
                  <span>تحميل الرَّمز (SVG)</span>
                </button>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center w-full text-center gap-3 p-4 animate-in fade-in-50 duration-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-destructive">تعذَّر إنشاء رمز الـ QR</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    حدث خطأ غير مُتوقَّع أثناء إعداد الرَّمز، يُرجَى المحاولة مرَّة أخرى.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSvg(null);
                    setError(false);
                    setGenerationKey((key) => key + 1);
                  }}
                  className={cn(
                    'mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium',
                    'bg-background text-foreground hover:bg-accent border border-border shadow-2xs',
                    'transition-all duration-200 active:scale-[0.98] cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>إعادة المحاولة</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-10 animate-in fade-in-50 duration-200">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                  <Loader2
                    className="relative size-6 animate-spin text-primary"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-xs font-medium text-muted-foreground animate-pulse">
                  جاري جلب رمز الـ QR...
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
