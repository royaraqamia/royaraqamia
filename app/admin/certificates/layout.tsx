import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/actions/admin-certificates';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { GoUpButton } from '@/components/GoUpButton';
import { WhatsAppFloat } from '@/components/WhatsAppFloat';
import { Plus } from 'lucide-react';

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
    // UNAUTHORIZED — redirect to login with return path
    redirect('/auth/login?redirect=/admin/certificates');
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24">
        <div className="container mx-auto max-w-6xl px-4 pb-8">
          {/* Admin Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">إدارة الشهادات</h1>
              <p className="text-muted-foreground text-sm">إصدار وتعديل وحذف شهادات الطلاب</p>
            </div>
            <Link
              href="/admin/certificates/new"
              className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-[44px]"
            >
              <Plus className="size-4" />
              شهادة جديدة
            </Link>
          </div>

          {children}
        </div>
      </main>
      <Footer />
      <GoUpButton />
      <WhatsAppFloat />
    </div>
  );
}
