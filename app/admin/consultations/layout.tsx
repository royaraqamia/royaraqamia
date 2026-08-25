import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { Navbar } from '@/frontend/ui/Navbar';
import { Footer } from '@/frontend/ui/Footer';
import { CalendarCheck2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'إدارة الاستشارات | رؤية رقمية',
  description: 'إدارة حجوزات الاستشارات والمواعيد والباقات وإعدادات الدفع.',
};

const SECTIONS = [
  { href: '/admin/consultations/bookings', label: 'الحجوزات' },
  { href: '/admin/consultations/availability', label: 'المواعيد' },
  { href: '/admin/consultations/packages', label: 'الباقات' },
  { href: '/admin/consultations/settings', label: 'الإعدادات' },
];

export default async function AdminConsultationsLayout({
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
    redirect('/auth/login?redirect=/admin/consultations');
  }

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24">
        <div className="container mx-auto max-w-6xl px-4 pb-8">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm">
              <CalendarCheck2 className="text-primary size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">إدارة الاستشارات</h1>
              <p className="text-muted-foreground text-sm">
                الحجوزات، المواعيد المتاحة، الباقات، وبيانات الدفع
              </p>
            </div>
          </div>

          <nav aria-label="أقسام إدارة الاستشارات" className="mb-8 flex flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-full border border-border bg-card px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11 inline-flex items-center"
              >
                {section.label}
              </Link>
            ))}
          </nav>

          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
