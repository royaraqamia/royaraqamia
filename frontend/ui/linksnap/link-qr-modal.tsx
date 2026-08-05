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

interface LinkQrModalProps {
  code: string;
  baseUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkQrModal({ code, baseUrl, open, onOpenChange }: LinkQrModalProps) {
  const [svg, setSvg] = useState<string | null>(null);

  const shortUrl = getShortLinkUrl(baseUrl, code);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const style = getComputedStyle(document.documentElement);
    const fg = style.getPropertyValue('--foreground').trim();
    const bg = style.getPropertyValue('--background').trim();

    QRCode.toString(shortUrl, {
      type: 'svg',
      width: 240,
      margin: 1,
      color: { dark: `hsl(${fg})`, light: `hsl(${bg})` },
    })
      .then((value) => {
        if (!cancelled) setSvg(value);
      })
      .catch((err: unknown) => {
        logger.error('QR generation failed', { error: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [open, shortUrl]);

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
