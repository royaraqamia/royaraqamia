import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: {
    default: 'مُنزِّل الوسائط',
    template: '%s | رؤيَة رقَميَّة',
  },
  description: 'حمّل الصوت أو الفيديو من رابط على منصّات التواصل الاجتماعي بسهولة وأمان.',
  alternates: { canonical: '/downloader' },
};

export default function DownloaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        {children}
      </main>
    </div>
  );
}
