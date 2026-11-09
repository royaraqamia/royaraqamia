import './app.css';
import type { Metadata } from 'next';
import { loadRatesBoard } from '@/backend/loaders/rates';
import { RatesSurface } from '@/frontend/ui/rates/rates-surface';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'أسعار الصَّرف',
  description:
    'أسعار صرف جميع عملات العالم مقابل الدُّولار الأمريكي، وأسعار الذَّهب والفِضَّة اللَّحظيَّة بالأونصة والغرام.',
  alternates: { canonical: '/rates' },
  openGraph: {
    title: 'أسعار الصَّرف والذَّهب والفِضَّة | رؤيَة رقَميَّة',
    description:
      'أسعار صرف جميع عملات العالم مقابل الدُّولار الأمريكي، وأسعار الذَّهب والفِضَّة اللَّحظيَّة بالأونصة والغرام.',
    url: '/rates',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'أسعار الصَّرف' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'أسعار الصَّرف والذَّهب والفِضَّة | رؤيَة رقَميَّة',
    description:
      'أسعار صرف جميع عملات العالم مقابل الدُّولار الأمريكي، وأسعار الذَّهب والفِضَّة اللَّحظيَّة بالأونصة والغرام.',
    images: ['/OG Image.webp'],
  },
};

export default async function RatesPage() {
  const board = await loadRatesBoard();

  return (
    <div className="relative min-h-[var(--roy-page-height)] bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary antialiased">
      <main id="main-content" dir="rtl" className="flex-1 pt-6 pb-28 md:pb-32">
        <RatesSurface board={board} />
      </main>
    </div>
  );
}
