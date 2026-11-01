import type { Metadata } from 'next';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { DownloaderNav } from '@/frontend/ui/admin/downloader/downloader-nav';

export const metadata: Metadata = {
  title: 'مُنزِّل الوسائط',
  description: 'إدارة مُنزِّل الوسائط: الطلبات، قائمة الحظر، المنصّات، والحدود.',
};

export default function AdminDownloaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      <AdminPageHeader title="مُنزِّل الوسائط">
        <DownloaderNav />
      </AdminPageHeader>

      {children}
    </div>
  );
}
