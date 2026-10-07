import type { Metadata } from 'next';
import { DownloaderPage } from '@/frontend/ui/downloader/downloader-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'مُنزِّل الوسائط',
  description: 'حمّل الصوت أو الفيديو من رابط على منصّات التواصل الاجتماعي بسهولة وأمان.',
  alternates: { canonical: '/downloader' },
};

export default function DownloaderRoute() {
  return <DownloaderPage />;
}
