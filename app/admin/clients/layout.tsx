import type { Metadata } from 'next';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { ClientsNav } from '@/frontend/ui/admin/clients-nav';

export const metadata: Metadata = {
  title: 'العملاء',
  description: 'طلبات المشاريع والتَّعاقُدات الشَّهريَّة الواردة من الموقع.',
};

/**
 * The "العملاء" section. Project Requests and the Retainer book are two views of
 * the same client work, so they share one section header and one nav.
 */
export default function AdminClientsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader title="العملاء">
        <ClientsNav />
      </AdminPageHeader>

      {children}
    </div>
  );
}
