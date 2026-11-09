import type { Metadata } from 'next';

import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';

export const metadata: Metadata = {
  title: 'إبلاغات المحادثات',
  description: 'مراجعة بلاغات المحادثات ومقتطفاتها المجمّدة.',
};

export default function AdminReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader title="إبلاغات المحادثات" />
      {children}
    </div>
  );
}
