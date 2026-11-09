import '@/app/mcp/app.css';
import Link from 'next/link';

import { CodeSnippet } from '@/frontend/ui/mcp/code-snippet';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

/**
 * The guide's content, without the page frame.
 *
 * `/mcp/guide` passes the origin its server lives on; the homepage passes the
 * origin the reader is on, so a local build shows a local URL (ADR-0151).
 */
function StepCard({
  id,
  step,
  title,
  children,
}: {
  /** The section's address (ADR-0147): `/mcp/guide#install`, `#connect`, … */
  id: string;
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className="scroll-mt-28 relative overflow-hidden rounded-3xl border border-border/60 bg-card/85 p-6 shadow-xs"
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

export function McpGuideSurface({ serverUrl }: { serverUrl: string }) {
  return (
    <div className="cv-auto mx-auto max-w-3xl px-4">
      <div className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12">
        <SectionTitle as="h1">
          <SectionTitleHighlight>ربط الـ MCP</SectionTitleHighlight>
        </SectionTitle>
      </div>

      <div className="space-y-4 sm:space-y-5">
        <StepCard id="install" step={1} title="عنوان الخادم">
          <p>
            جميع وكلاء البرمجة تحتاج إلى عنوان URL واحد. أضِفه إلى العميل مرة واحدة، وسيهتم العميل
            بكل الباقي — بما فيه فتح المتصفح لتسجيل الدخول أول مرة.
          </p>
          <CodeSnippet code={serverUrl} label="عنوان الخادم" copyLabel="نسخ عنوان الخادم" />
        </StepCard>

        <StepCard id="connect" step={2} title="Claude Code">
          <p>من داخل طرفية Claude Code شغّل أمر الربط التالي:</p>
          <CodeSnippet
            code={`claude mcp add --transport http royaraqamia ${serverUrl}`}
            copyLabel="نسخ أمر Claude Code"
          />
        </StepCard>

        <StepCard id="opencode" step={3} title="OpenCode">
          <p>
            أضِف الخادم إلى ملف <code className="font-mono">opencode.json</code> في مجلد المشروع (أو
            الإعدادات العامة):
          </p>
          <CodeSnippet
            copyLabel="نسخ تكوين OpenCode"
            code={`
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "royaraqamia": {
      "type": "remote",
      "url": "${serverUrl}",
      "enabled": true
    }
  }
}
`}
          />
        </StepCard>

        <StepCard id="codex" step={4} title="Codex">
          <p>من طرفية Codex شغّل أمر الربط التالي:</p>
          <CodeSnippet
            code={`codex mcp add royaraqamia --url ${serverUrl}`}
            copyLabel="نسخ أمر Codex"
          />
          <p>
            أو أضِف الخادم يدويًا إلى ملف <code className="font-mono">~/.codex/config.toml</code>:
          </p>
          <CodeSnippet
            label="التَّكوين النَّاتِج"
            copyLabel="نسخ تكوين Codex"
            code={`
[mcp_servers.royaraqamia]
url = "${serverUrl}"
`}
          />
        </StepCard>

        <StepCard id="other-client" step={5} title="أي عميل آخر">
          <p>
            إن كان عميلك يدعم MCP عبر «Streamable HTTP» — وهذا يشمل Cursor وGemini CLI ومعظم الوكلاء
            الحديثين — فكل ما تحتاجه هو عنوان الخادم في الخطوة 1. النظام يعتمد OAuth 2.1 مع PKCE،
            لذا لن تحتاج لنسخ أي مفاتيح أو رموز يدويًا.
          </p>
        </StepCard>
      </div>

      <p className="mt-6 text-center text-sm sm:text-base leading-relaxed text-muted-foreground">
        لمتابعة ما وصل إليه كل تطبيق — أو لفصل أحدها دون تسجيل الخروج — افتح{' '}
        <Link
          href="/account/connected-apps"
          className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded"
        >
          التَّطبيقات المتَّصلة بالـ MCP
        </Link>{' '}
        في حسابك.
      </p>
    </div>
  );
}
