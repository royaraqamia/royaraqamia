'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { getShortLinkUrl } from '@/frontend/shared/linksnap/get-short-link-url';
import { cn } from '@/frontend/shared/cn';
import { Loader2, Download } from 'lucide-react';
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

    QRCode.toString(shortUrl, {
      type: 'svg',
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: dark ?? '#000000', light: light ?? '#ffffff' },
    })
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رمز الاستجابة السريعة</DialogTitle>
          <DialogDescription>
            امسح الرمز لعرض الرابط:{' '}
            <span dir="ltr" className="font-mono">
              {shortUrl}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {svg ? (
            <>
              <div
                className="rounded-2xl border border-border bg-background p-3 shadow-sm"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <button
                type="button"
                onClick={handleDownload}
                className={cn(
                  'px-4 py-2.5 rounded-full font-medium text-xs flex items-center gap-1.5',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'transition-all cursor-pointer focus-ring touch-target btn-press'
                )}
              >
                <Download aria-hidden="true" className="w-3.5 h-3.5" />
                تحميل الرمز (SVG)
              </button>
            </>
          ) : error ? (
            <div className="flex flex-col items-center justify-center w-60 h-60 gap-3 text-center">
              <p className="text-xs font-medium text-destructive">
                تعذّر إنشاء رمز الاستجابة السريعة
              </p>
              <button
                type="button"
                onClick={() => {
                  setSvg(null);
                  setError(false);
                  setGenerationKey((key) => key + 1);
                }}
                className="px-4 py-2 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-all cursor-pointer focus-ring touch-target"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center w-60 h-60">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
