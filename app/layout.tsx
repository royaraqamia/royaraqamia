import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './global.css';
import './dark-theme-override.css';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MotionProvider } from '../components/MotionProvider';
import { UIProvider } from '../context/UIContext';
import { SessionProvider } from '../components/shared/session-provider';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { AccessibilityCheck } from '../components/AccessibilityCheck';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'رؤية رقمية',
  description:
    'نبني مواقع إلكترونيَّة وتطبيقات بكود نظيف، قابل للصِّيانة والتَّوسُّع؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.',
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
  authors: [{ name: 'رؤية رقمية' }],
  creator: 'رؤية رقمية',
  publisher: 'رؤية رقمية',
  metadataBase: new URL('https://royaraqamia.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'رؤية رقمية',
    description:
      'نبني مواقع إلكترونيَّة وتطبيقات بكود نظيف، قابل للصِّيانة والتَّوسُّع؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.',
    url: '/',
    siteName: 'رؤية رقمية',
    locale: 'ar_SY',
    type: 'website',
    images: [
      {
        url: '/OG Image.webp',
        width: 1200,
        height: 630,
        alt: 'رؤية رقمية',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'رؤية رقمية',
    description:
      'نبني مواقع إلكترونيَّة وتطبيقات بكود نظيف، قابل للصِّيانة والتَّوسُّع؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.',
    images: ['/OG Image.webp'],
  },
  other: {},
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={inter.className}>
        <ErrorBoundary>
          <SessionProvider>
            <MotionProvider>
              <UIProvider>
                <SpeedInsights />
                <Analytics />
                {children}
                <Toaster position="top-center" richColors />
                {process.env.NODE_ENV === 'development' && <AccessibilityCheck />}
              </UIProvider>
            </MotionProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
