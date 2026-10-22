import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'الاشتراكات',
  description: 'تفعيل الخطط المدفوعة ومتابعة رصيد الاستهلاك لكل مستخدم.',
};

export default function AdminPlansLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={Wallet}
        title="الاشتراكات والاستهلاك"
        description="رصيد الفترة الجارية لكل مستخدم، وتفعيل الخطة المدفوعة يدوياً عند وصول الدفعة."
      />
      {children}
    </div>
  );
}
