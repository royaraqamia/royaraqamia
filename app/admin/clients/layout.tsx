import type { Metadata } from 'next';
import { Briefcase } from 'lucide-react';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'العملاء',
  description: 'طلبات المشاريع والعقود الشَّهريَّة الواردة من الموقع.',
};

/**
 * The "العملاء" section. One sub-queue today (Project Requests); a section nav is
 * deliberately absent while there is a single destination, and arrives with the
 * Retainer book.
 */
export default function AdminClientsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader
        icon={Briefcase}
        title="العملاء"
        description="طلبات المشاريع والعقود الشَّهريَّة الواردة من الموقع"
      />

      {children}
    </div>
  );
}
