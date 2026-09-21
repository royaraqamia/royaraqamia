import type { Metadata } from 'next';
import { Megaphone } from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'إرسال إعلان',
  description: 'إرسال إشعار لمستخدمين محددين أو لجميع المستخدمين في رؤيَة رقَميَّة.',
};

export default function AdminAnnouncementsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-3xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={Megaphone}
        title="إرسال إعلان"
        description="يُرسل إشعارًا لمستخدمين محددين أو لجميع المستخدمين المسجلين"
      />

      {children}
    </div>
  );
}
