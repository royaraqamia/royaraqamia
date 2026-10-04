import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';
import { Footer } from '@/frontend/ui/Footer';
import { loadRatesBoard } from '@/backend/loaders/rates';
import { RatesExplorer } from '@/frontend/ui/rates/RatesExplorer';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'أسعار الصَّرف والذَّهب والفِضَّة',
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

function formatDate(value: string): string {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    dateStyle: 'medium',
    ...(isDateOnly ? { timeZone: 'UTC' } : {}),
  }).format(date);
}

export default async function RatesPage() {
  const board = await loadRatesBoard();

  return (
    <div className="relative min-h-dvh bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary antialiased">
      <Navbar />

      <main id="main-content" dir="rtl" className="flex-1 pt-24 pb-16 md:pt-32 md:pb-24">
        <div className="cv-auto mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8 text-start">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl mb-3">
              أسعار الصَّرف
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              أسعار جميع عملات العالم مقابل الدُّولار الأمريكي، وأسعار الذَّهب والفِضَّة اللَّحظيَّة
              — مع محوِّل وبيانات تاريخيَّة.
            </p>

            {board ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span>
                  آخر تحديث:{' '}
                  <strong className="font-bold text-foreground">
                    {formatDate(board.fetchedAt)}
                  </strong>
                </span>
                <span>
                  تاريخ السِّعر:{' '}
                  <strong className="font-bold text-foreground">
                    {formatDate(board.providerQuoteDate)}
                  </strong>
                </span>
                {board.isStale ? (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 font-bold text-warning">
                    قد تكون البيانات متأخِّرة
                  </span>
                ) : null}
              </div>
            ) : null}
          </header>

          {board ? (
            <RatesExplorer board={board} />
          ) : (
            <div className="rounded-3xl border border-border/60 bg-card/85 p-8 text-center text-muted-foreground">
              تعذَّر تحميل الأسعار حاليًّا. يُرجى المحاولة لاحقًا.
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
