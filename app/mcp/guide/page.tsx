import '../app.css';
import type { Metadata } from 'next';

import { env } from '@/backend/config/env';
import { McpGuideSurface } from '@/frontend/ui/mcp/guide-surface';

const SERVER_URL = `${env.origin}/mcp`;

export const metadata: Metadata = {
  title: 'ربط الـ MCP',
  description:
    'اربط وكلاء البرمجة — Claude Code وOpenCode وCodex ونظائرها — بأدوات رؤيَة رقَميَّة عبر بروتوكول سياق النماذج (MCP).',
  alternates: { canonical: '/mcp/guide' },
  openGraph: {
    title: 'ربط الـ MCP',
    description:
      'اربط وكلاء البرمجة بأدوات رؤيَة رقَميَّة عبر بروتوكول سياق النماذج (MCP) بخطوة واحدة.',
    url: '/mcp/guide',
    siteName: 'رؤيَة رقَميَّة',
    locale: 'ar_SY',
    type: 'website',
    images: [{ url: '/OG Image.webp', width: 1200, height: 630, alt: 'ربط الـ MCP' }],
  },
  twitter: { card: 'summary_large_image' },
};

export default function McpGuidePage() {
  return (
    <div className="relative min-h-[var(--roy-page-height)] bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary antialiased">
      <main id="main-content" className="flex-1 pt-6 pb-28 md:pb-32" dir="rtl">
        <McpGuideSurface serverUrl={SERVER_URL} />
      </main>
    </div>
  );
}
