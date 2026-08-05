import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { Navbar } from '@/frontend/ui/Navbar';
import { Footer } from '@/frontend/ui/Footer';
import { Megaphone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'إرسال إعلان',
  description: 'إرسال إشعار عام لجميع المستخدمين في رؤية رقمية.',
};

export default async function AdminAnnouncementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdminAuth();
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      redirect('/');
    }
    redirect('/auth/login?redirect=/admin/announcements');
  }

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24">
        <div className="container mx-auto max-w-3xl px-4 pb-8">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
              <Megaphone className="text-primary size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">إرسال إعلان عام</h1>
              <p className="text-muted-foreground text-sm">
                يُرسل إشعارًا لجميع المستخدمين المسجلين
              </p>
            </div>
          </div>

          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
