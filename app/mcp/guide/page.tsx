import type { Metadata } from 'next';

import { env } from '@/backend/config/env';
import { Navbar } from '@/frontend/ui/Navbar';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

const SERVER_URL = `${env.baseUrl.replace(/\/+$/, '')}/mcp`;

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

function Snippet({ children, label }: { children: string; label?: string }) {
  return (
    <div className="mt-4">
      {label && <p className="mb-1.5 text-xs font-bold text-muted-foreground">{label}</p>}
      <pre
        dir="ltr"
        lang="en"
        className="overflow-x-auto rounded-xl border border-border/70 bg-zinc-950 p-4 text-left text-sm leading-relaxed text-zinc-100 font-mono dark:border-border/40"
      >
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
          {step}
        </span>
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      <div className="mt-3 space-y-2 text-sm sm:text-base leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function McpGuidePage() {
  return (
    <div className="relative min-h-dvh bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary antialiased">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24 pb-16 md:pt-32 md:pb-24" dir="rtl">
        <div className="cv-auto mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
            <SectionTitle>
              ربط الـ <SectionTitleHighlight>MCP</SectionTitleHighlight>
            </SectionTitle>
          </div>

          <div className="space-y-4 sm:space-y-5">
            <StepCard step={1} title="عنوان الخادم">
              <p>
                جميع وكلاء البرمجة تحتاج إلى عنوان URL واحد. أضِفه إلى العميل مرة واحدة، وسيهتم
                العميل بكل الباقي — بما فيه فتح المتصفح لتسجيل الدخول أول مرة.
              </p>
              <Snippet label="عنوان الخادم">{SERVER_URL}</Snippet>
            </StepCard>

            <StepCard step={2} title="Claude Code">
              <p>من داخل طرفية Claude Code شغّل أمر الربط التالي:</p>
              <Snippet>{`claude mcp add --transport http royaraqamia ${SERVER_URL}`}</Snippet>
            </StepCard>

            <StepCard step={3} title="OpenCode">
              <p>
                أضِف الخادم إلى ملف <code className="font-mono">opencode.json</code> في مجلد المشروع
                (أو الإعدادات العامة):
              </p>
              <Snippet>{`
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "royaraqamia": {
      "type": "remote",
      "url": "${SERVER_URL}",
      "enabled": true
    }
  }
}
`}</Snippet>
            </StepCard>

            <StepCard step={4} title="Codex">
              <p>من طرفية Codex شغّل أمر الربط التالي:</p>
              <Snippet>{`codex mcp add royaraqamia --url ${SERVER_URL}`}</Snippet>
              <p>
                أو أضِف الخادم يدويًا إلى ملف{' '}
                <code className="font-mono">~/.codex/config.toml</code>:
              </p>
              <Snippet label="التَّكوين النَّاتِج">{`
[mcp_servers.royaraqamia]
url = "${SERVER_URL}"
`}</Snippet>
            </StepCard>

            <StepCard step={5} title="أي عميل آخر">
              <p>
                إن كان عميلك يدعم MCP عبر «Streamable HTTP» — وهذا يشمل Cursor وGemini CLI ومعظم
                الوكلاء الحديثين — فكل ما تحتاجه هو عنوان الخادم في الخطوة 1. النظام يعتمد OAuth 2.1
                مع PKCE، لذا لن تحتاج لنسخ أي مفاتيح أو رموز يدويًا.
              </p>
            </StepCard>
          </div>
        </div>
      </main>
    </div>
  );
}
