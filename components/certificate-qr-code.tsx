import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

interface CertificateQRCodeProps {
  code: string;
  baseUrl?: string;
  size?: number;
  className?: string;
}

export async function CertificateQRCode({
  code,
  baseUrl = 'https://royaraqamia.com',
  size = 200,
  className,
}: CertificateQRCodeProps) {
  const url = `${baseUrl}/verify/${encodeURIComponent(code)}`;

  const svg = await QRCode.toString(url, {
    type: 'svg',
    width: size,
    margin: 2,
    color: {
      dark: '#ffffff',
      light: '#00000000',
    },
    errorCorrectionLevel: 'M',
  });

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-2', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Generate QR code as data URL (for client-side image embedding).
 */
export async function generateCertificateQR(
  code: string,
  baseUrl = 'https://royaraqamia.com',
  size = 300
): Promise<string> {
  const url = `${baseUrl}/verify/${encodeURIComponent(code)}`;
  return QRCode.toDataURL(url, {
    width: size,
    margin: 2,
    color: {
      dark: '#1e293b',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Generate QR code as PNG Buffer (for server-side PDF/image generation).
 */
export async function generateCertificateQRBuffer(
  code: string,
  baseUrl = 'https://royaraqamia.com',
  size = 300
): Promise<Buffer> {
  const url = `${baseUrl}/verify/${encodeURIComponent(code)}`;
  return QRCode.toBuffer(url, {
    width: size,
    margin: 2,
    color: {
      dark: '#1e293b',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}
