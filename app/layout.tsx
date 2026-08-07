import type { Metadata } from 'next';
import './global.css';
import './dark-theme-override.css';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/frontend/ui/shared/error-boundary';
import { MotionProvider } from '../frontend/ui/MotionProvider';
import { UIProvider } from '../frontend/state/UIContext';
import { NotificationProvider } from '../frontend/state/NotificationContext';
import { SessionProvider } from '../frontend/state/session-provider';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { VersionChecker } from '../frontend/ui/VersionChecker';
import { PWAProvider } from '../frontend/ui/PWAProvider';
import { GoUpButton } from '../frontend/ui/GoUpButton';
import { WhatsAppFloat } from '../frontend/ui/WhatsAppFloat';
import { SITE_NAME } from '@/frontend/shared/metadata';
import { ibmPlexSansArabic, arefRuqaa } from '@/frontend/shared/fonts';
import { RouteChangeFocus } from '@/frontend/ui/RouteChangeFocus';

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'نبني مواقع وتطبيقات برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.',
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
      'نبني مواقع وتطبيقات برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.',
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
      'نبني مواقع وتطبيقات برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء المواقع والتَّطبيقات.',
    images: ['/OG Image.webp'],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'رؤية رقمية',
  },
  icons: [
    { rel: 'icon', url: '/favicon.ico' },
    { rel: 'icon', type: 'image/png', sizes: '192x192', url: '/icons/icon-192x192.png' },
    { rel: 'icon', type: 'image/png', sizes: '512x512', url: '/icons/icon-512x512.png' },
    { rel: 'apple-touch-icon', sizes: '152x152', url: '/icons/apple-touch-icon-152x152.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', url: '/icons/apple-touch-icon-180x180.png' },
  ],
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
    { media: '(prefers-color-scheme: light)', color: '#0f172a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${ibmPlexSansArabic.variable} ${arefRuqaa.variable}`}>
      <head>
        <link rel="stylesheet" href="/design-system/lib/design-tokens.css" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="رؤية رقمية" />
      </head>
      <body>
        <ErrorBoundary>
          <SessionProvider>
            <MotionProvider>
              <UIProvider>
                <NotificationProvider>
                  <SpeedInsights />
                  <Analytics />
                  <PWAProvider>
                    <VersionChecker />
                    <RouteChangeFocus />
                    {children}
                    <GoUpButton />
                    <WhatsAppFloat />
                  </PWAProvider>
                  <Toaster position="top-center" richColors />
                </NotificationProvider>
              </UIProvider>
            </MotionProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
