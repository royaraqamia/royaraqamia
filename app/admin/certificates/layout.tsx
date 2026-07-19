import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/actions/admin-certificates';

export const metadata: Metadata = {
  title: 'إدارة الشهادات | رؤية رقمية',
};

export default async function AdminCertificatesLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      redirect('/');
    }
    // UNAUTHORIZED — middleware handles redirect to login
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        {/* Admin Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">إدارة الشهادات</h1>
            <p className="text-muted-foreground text-sm">إصدار وتعديل وحذف شهادات الطلاب</p>
          </div>
          <Link
            href="/admin/certificates/new"
            className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            شهادة جديدة
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}
