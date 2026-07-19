'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

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
    const url = `${baseUrl}/verify/${encodeURIComponent(code)}`;
    QRCode.toString(url, {
      type: 'svg',
      width: size,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#00000000',
      },
      errorCorrectionLevel: 'M',
    }).then(setSvg);
  }, [code, baseUrl, size]);

  if (!svg) {
    return (
      <div
        className={cn('inline-flex items-center justify-center', className)}
        style={{ width: size, height: size }}
      >
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-2', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
