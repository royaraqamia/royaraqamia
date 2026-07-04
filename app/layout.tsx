import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './global.css';
import './dark-theme-override.css';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { UIProvider } from '../context/UIContext';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'رؤية رقمية',
  description: 'نبني لك مواقع إلكترونيَّة وتطبيقات | + ندرِّبك على بنائها. ونزوِّدك بمنتجات رقميَّة من صنع أيدينا لإدارة أعمالك وزبائنك بدقَّة واحترافيَّة.',
  keywords: [
    'رؤية رقمية',
    'تدريب إلكتروني',
    'دورات برمجة',
    'دورات تسويق رقمي',
    'دورات تصميم',
    'ذكاء اصطناعي',
    'استشارات تقنية',
    'تشبيك احترافي',
    'منصة تدريب عربية',
    'تعليم إلكتروني',
    'شهادات معتمدة',
    'برمجة تطبيقات',
    'تطوير ويب',
    'تسويق إلكتروني',
    'تصميم جرافيك',
    'تجربة مستخدم',
    'e-learning Arabic',
    'digital training',
    'tech courses Arabic',
    'online certification',
    'Roya Raqamia',
  ],
  metadataBase: new URL('https://royaraqamia.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'رؤية رقمية',
    description: 'نبني لك مواقع إلكترونيَّة وتطبيقات | + ندرِّبك على بنائها.',
    url: 'https://royaraqamia.com',
    siteName: 'رؤية رقمية',
    locale: 'ar_SY',
    type: 'website',
  },
};
      
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className={inter.className}>
        <ErrorBoundary>
          <UIProvider>
            <SpeedInsights />
            <Analytics />
            {children}
            <Toaster position="top-center" richColors />
          </UIProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}