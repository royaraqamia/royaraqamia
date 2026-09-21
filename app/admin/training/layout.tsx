import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'طلبات الالتحاق',
  description: 'طلبات الالتحاق بدورة التَّدريب في رؤيَة رقَميَّة.',
};

export default function AdminTrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={GraduationCap}
        title="طلبات الالتحاق"
        description="الطَّلبات الواردة من صفحة التَّقديم على الدَّورة"
      />

      {children}
    </div>
  );
}
