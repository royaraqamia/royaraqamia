import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'إدارة الشَّهادات',
  description: 'إصدار وتعديل وحذف شهادات الطُّلاب في رؤيَة رقَميَّة.',
};

export default function AdminCertificatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={ShieldCheck}
        title="إدارة الشَّهادات"
        description="إصدار وتعديل وحذف شهادات الطُّلاب"
      />

      {children}
    </div>
  );
}
