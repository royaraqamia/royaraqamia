import type { Metadata } from 'next';
import { Link2 } from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'إدارة الرَّوابط',
  description: 'إحصاءات المنصَّة ودليل الرَّوابط الكامل وحظر الرَّوابط في رؤيَة رقَميَّة.',
};

export default function AdminLinkSnapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={Link2}
        title="إدارة الرَّوابط"
        description="إحصاءات المنصَّة، دليل الرَّوابط الكامل، وحظر الرَّوابط"
      />

      {children}
    </div>
  );
}
