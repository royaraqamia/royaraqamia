import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: 'طلبات الالتحاق',
  description: 'طلبات الالتحاق بدورة التَّدريب في رؤية رقمية.',
};

export default async function AdminTrainingLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdminAuth();
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      redirect('/');
    }
    redirect('/auth/login?redirect=/admin/training/applications');
  }

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24">
        <div className="container mx-auto max-w-6xl px-4 pb-8">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
              <GraduationCap className="text-primary size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">طلبات الالتحاق</h1>
              <p className="text-muted-foreground text-sm">
                الطَّلبات الواردة من صفحة التَّقديم على الدَّورة
              </p>
            </div>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
