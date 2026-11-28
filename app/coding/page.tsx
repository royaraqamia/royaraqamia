import type { Metadata } from 'next';

import './app.css';
import { CodingTaskList } from '@/frontend/ui/coding/coding-task-list';
import { CodingWorkspaces } from '@/frontend/ui/coding/coding-workspaces';

export const metadata: Metadata = {
  title: 'مهام البرمجة',
  description: 'اربط مستودعك، راجع الخطة والتغييرات، ثم استلم النتيجة في فرع وطلب دمج.',
  robots: { index: false, follow: false },
};

/** Account-scoped reads happen in the client, so the shell itself is per request. */
export const dynamic = 'force-dynamic';

/**
 * Phase 1's document surface (ADR-0219). Both clients open this route; there is
 * no native copy and no parity row. The plan is not read here, so the cap banner
 * names the free limits until the member's plan is known.
 */
export default function CodingPage() {
  return (
    <main id="main-content" dir="rtl" className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">مهام البرمجة</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        يبدأ العمل بخطة وفرق تعرضها عليك للموافقة، ولا يُنشر شيء إلى مستودعك بغير قرار منك.
      </p>
      <div className="mt-6 flex flex-col gap-6">
        <CodingWorkspaces plan={null} />
        <CodingTaskList />
      </div>
    </main>
  );
}
