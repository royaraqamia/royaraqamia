import type { Metadata } from 'next';
import { CalendarCheck2 } from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { ConsultationNav } from '@/frontend/ui/admin/consultation/consultation-nav';

export const metadata: Metadata = {
  title: 'إدارة الاستشارات',
  description: 'إدارة حجوزات الاستشارات والمواعيد والباقات وإعدادات الدفع.',
};

export default function AdminConsultationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={CalendarCheck2}
        title="إدارة الاستشارات"
        description="الحجوزات، المواعيد المتاحة، الباقات، وبيانات الدفع"
      >
        <ConsultationNav />
      </AdminPageHeader>

      {children}
    </div>
  );
}
