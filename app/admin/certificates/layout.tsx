import type { Metadata } from 'next';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { MotionRoot } from '@/frontend/ui/MotionRoot';

export const metadata: Metadata = {
  title: 'إدارة الشَّهادات',
  description: 'إصدار وتعديل وحذف شهادات الطُّلاب في رؤيَة رقَميَّة.',
};

export default function AdminCertificatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader title="إدارة الشَّهادات" />

      <MotionRoot>{children}</MotionRoot>
    </div>
  );
}
