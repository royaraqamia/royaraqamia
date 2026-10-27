import './app.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NewsBoard } from '@/frontend/ui/news/NewsBoard';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const metadata: Metadata = {
  title: 'أخبار اليوم',
  description:
    'مُلخَّص يومي لأهم أخبار العالم من مصادر موثوقة: التقنية والسياسة والدين أولاً، وأولوية للعالم العربي والإسلامي، مع رابط المصدر الأصلي لكل خبر.',
  alternates: { canonical: '/news' },
  openGraph: {
    title: 'أخبار اليوم | رؤى رقميّة',
    description:
      'مُلخَّص يومي لأهم أخبار العالم من مصادر موثوقة، بترتيب يعطي الأولوية للعالم العربي والإسلامي وللأخبار التقنية والسياسية والدينية.',
    url: '/news',
    siteName: 'رؤى رقميّة',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'أخبار اليوم' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'أخبار اليوم | رؤى رقميّة',
    description: 'مُلخَّص يومي لأهم أخبار العالم من مصادر موثوقة، مع رابط المصدر الأصلي لكل خبر.',
    images: ['/OG Image.webp'],
  },
};

/**
 * `/news` is a data-free shell (#555).
 *
 * The board used to be read here, from `searchParams` — exactly the shape the
 * build cannot prerender, which is why the precache generator kept skipping this
 * route and an offline open of `/news` fell through to `/` via the ancestor
 * fallback (#490, ADR-0071). The filters and the digest moved into `NewsBoard`,
 * so the document is the same for every reader and every filter: the build
 * prerenders it, the worker precaches it, and the rows arrive as a client read
 * that the public snapshot store keeps for the tunnel.
 *
 * Nothing account-bearing is rendered into this document. A reader with their
 * own sources still reads their digest from the client, and the route answers
 * that read `no-store`.
 */
export default function NewsPage() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      <main id="main-content" dir="rtl" className="flex-1 pt-10 pb-20 md:pb-28">
        <div className="mx-auto max-w-4xl px-4">
          <header className="mb-8 text-center">
            <SectionTitle as="h1">
              <SectionTitleHighlight>أخبار اليوم</SectionTitleHighlight>
            </SectionTitle>
          </header>

          <Suspense fallback={<NewsShellFallback />}>
            <NewsBoard />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

/**
 * The prerendered document's own frame — the same one the board draws before its
 * first answer, and the only one an offline first visit can have: nothing was
 * ever seen, so there is no snapshot to paint (the limit the spec states).
 */
function NewsShellFallback() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border/60 bg-muted/20 p-5">
          <div className="h-4 w-24 rounded-full bg-muted/60" />
          <div className="mt-4 h-5 w-3/4 rounded-full bg-muted/70" />
          <div className="mt-3 h-3.5 w-full rounded-full bg-muted/50" />
          <div className="mt-2 h-3.5 w-2/3 rounded-full bg-muted/50" />
        </div>
      ))}
    </div>
  );
}
