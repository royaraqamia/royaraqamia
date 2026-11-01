import type { Metadata } from 'next';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'الاشتراكات',
  description: 'تفعيل الخطط المدفوعة ومتابعة استهلاك كل مستخدم.',
};

export default function AdminPlansLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader title="الاشتراكات والاستهلاك" />
      {children}
    </div>
  );
}
