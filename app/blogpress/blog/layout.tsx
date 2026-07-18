import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/blogpress/theme-toggle';

export const metadata: Metadata = {
  title: {
    default: 'المدونة',
    template: '%s | BlogPress',
  },
  description: 'اقرأ أحدث المقالات من BlogPress.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        تخطي إلى المحتوى
      </a>
      <header className="border-b border-border/50 sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <Link
            href="/blogpress"
            className="flex items-center gap-2.5 transition-smooth hover:opacity-80"
          >
            <Image src="/logo.webp" alt="BlogPress" width={1000} height={1000} className="size-7" />
            <span className="text-base font-bold tracking-tight hidden sm:inline">BlogPress</span>
          </Link>
          <nav className="flex items-center gap-1.5" aria-label="التنقل الرئيسي">
            <Link
              href="/blogpress"
              className="text-sm text-muted-foreground hover:text-foreground transition-smooth px-3 py-2 rounded-lg hover:bg-muted hidden sm:block"
            >
              الرئيسية
            </Link>
            <Link
              href="/blogpress/blog"
              className="text-sm text-muted-foreground hover:text-foreground transition-smooth px-3 py-2 rounded-lg hover:bg-muted"
            >
              المدونة
            </Link>
            <ThemeToggle />
            <Link href="/blogpress/dashboard">
              <Button variant="ghost" size="sm" className="transition-smooth">
                لوحة التحكم
              </Button>
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" className="flex-1 container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {children}
      </main>
      <footer className="border-t border-border/50 py-8" role="contentinfo">
        <div className="container mx-auto px-4 sm:px-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} BlogPress. مبني بـ Next.js.
        </div>
      </footer>
    </div>
  );
}
