import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import './global.css';
import './dark-theme-override.css';
import './toast.css';
import { RoyaToaster } from '@/frontend/ui/shared/toaster';
import { ErrorBoundary } from '@/frontend/ui/shared/error-boundary';
import { MotionProvider } from '../frontend/ui/MotionProvider';
import { UIProvider } from '../frontend/state/UIContext';
import { NotificationProvider } from '../frontend/state/NotificationContext';
import { SessionProvider } from '../frontend/state/session-provider';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { PWAProvider } from '../frontend/ui/PWAProvider';
import { FloatingActions } from '../frontend/ui/FloatingActions';
import { SITE_NAME } from '@/frontend/shared/metadata';
import { ASSET_VERSION } from '@/backend/config/generated/asset-version';
import { ibmPlexSansArabic, arefRuqaa } from '@/frontend/shared/fonts';
import { RouteChangeFocus } from '@/frontend/ui/RouteChangeFocus';

const designTokensCss = (() => {
  try {
    return readFileSync(
      join(process.cwd(), 'public', 'design-system', 'lib', 'design-tokens.css'),
      'utf8'
    );
  } catch {
    return null;
  }
})();

// Content-hashed cache-buster for the PWA/favicon assets. Same token the
// manifest and service worker build from, so every surface points at one URL set.
const ASSET_QUERY = `?v=${ASSET_VERSION}`;

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'نبني منتجات رقميَّة برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء التَّطبيقات.',
  keywords: [
    'رؤيَة رقَميَّة',
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
  authors: [{ name: 'رؤيَة رقَميَّة' }],
  creator: 'رؤيَة رقَميَّة',
  publisher: 'رؤيَة رقَميَّة',
  metadataBase: new URL('https://royaraqamia.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'رؤيَة رقَميَّة',
    description:
      'نبني منتجات رقميَّة برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء التَّطبيقات.',
    url: '/',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
    images: [
      {
        url: '/OG Image.webp',
        width: 1200,
        height: 630,
        alt: 'رؤيَة رقَميَّة',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'رؤيَة رقَميَّة',
    description:
      'نبني منتجات رقميَّة برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء التَّطبيقات.',
    images: ['/OG Image.webp'],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'رؤيَة رقَميَّة',
  },
  icons: [
    { rel: 'icon', url: `/favicon.ico${ASSET_QUERY}` },
    { rel: 'icon', type: 'image/png', sizes: '192x192', url: `/favicon-192x192.png${ASSET_QUERY}` },
    { rel: 'icon', type: 'image/png', sizes: '512x512', url: `/favicon-512x512.png${ASSET_QUERY}` },
    {
      rel: 'apple-touch-icon',
      sizes: '152x152',
      url: `/icons/apple-touch-icon-152x152.png${ASSET_QUERY}`,
    },
    {
      rel: 'apple-touch-icon',
      sizes: '180x180',
      url: `/icons/apple-touch-icon-180x180.png${ASSET_QUERY}`,
    },
  ],
  manifest: `/manifest.json${ASSET_QUERY}`,
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
    <html
      lang="ar"
      dir="rtl"
      className={`dark ${ibmPlexSansArabic.variable} ${arefRuqaa.variable}`}
    >
      <head>
        {designTokensCss ? (
          <style dangerouslySetInnerHTML={{ __html: designTokensCss }} />
        ) : (
          <link rel="stylesheet" href="/design-system/lib/design-tokens.css" />
        )}
        {/* PWA/manifest metas come from `metadata` above — don't duplicate them here. */}
        <meta name="application-name" content="رؤيَة رقَميَّة" />
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
                    <RouteChangeFocus />
                    {children}
                    <FloatingActions />
                  </PWAProvider>
                  <RoyaToaster />
                </NotificationProvider>
              </UIProvider>
            </MotionProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
