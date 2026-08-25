import type { Metadata } from 'next';
import { ShellHeader } from '@/frontend/ui/app-shell/shell-header';

export const metadata: Metadata = {
  title: {
    default: 'المدوَّنة',
    template: '%s | رؤية رقمية',
  },
  description: 'اقرأ أحدث المقالات من رؤية رقمية.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh text-foreground flex flex-col">
      <ShellHeader product="blog" />
      <main id="main-content" className="flex-1 container mx-auto px-4 sm:px-6 pt-6 pb-10 sm:pb-14">
        {children}
      </main>
    </div>
  );
}
