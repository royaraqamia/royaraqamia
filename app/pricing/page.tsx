import '../marketing.css';
import type { Metadata } from 'next';

import { loadPlanCatalog } from '@/backend/loaders/plans';
import { PricingView } from '@/frontend/ui/plans/pricing-view';

// The catalog changes through migrations, not through traffic, so five minutes
// of ISR is plenty and keeps three queries off every visit.
export const revalidate = 300;

const DESCRIPTION =
  'خطط التَّسعير في رؤيَة رَقَميَّة: خطَّتان لكل المنتجات — مجانيَّة بحدود 5 عناصر و5 تنزيلات، ومدفوعة بحدود 50 ودعم مباشر عبر واتساب.';

export const metadata: Metadata = {
  title: 'خطط التَّسعير',
  description: DESCRIPTION,
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'خطط التَّسعير | رؤيَة رقَميَّة',
    description: DESCRIPTION,
    url: '/pricing',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'خطط التَّسعير' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'خطط التَّسعير | رؤيَة رقَميَّة',
    description: DESCRIPTION,
    images: ['/OG Image.webp'],
  },
};

/**
 * Public and account-free on purpose: the account row links here for guests too,
 * and a visitor has an allowance of their own. The page reads the catalog on the
 * server and caches it; the plan cards' two pills resolve in the browser.
 */
export default async function PricingPage() {
  const catalog = await loadPlanCatalog();

  return (
    <main id="main-content" dir="rtl" className="mx-auto max-w-4xl px-4 pt-6 pb-16 md:pb-24">
      <PricingView catalog={catalog} />
    </main>
  );
}
