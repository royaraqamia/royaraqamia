import type { Metadata } from 'next';

import '../app.css';
import { CodingTaskDetail } from '@/frontend/ui/coding/coding-task-detail';

export const metadata: Metadata = {
  title: 'تفاصيل المهمة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** The detail route reads its id from the path; the task itself is a client read. */
export default async function CodingTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;

  return (
    <main id="main-content" dir="rtl" className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">تفاصيل المهمة</h1>
      <div className="mt-6">
        <CodingTaskDetail taskId={taskId} />
      </div>
    </main>
  );
}
