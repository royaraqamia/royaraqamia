import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardNav } from './_components/dashboard-nav';
import { HeaderActions } from './_components/header-actions';

export const metadata: Metadata = {
  title: {
    default: 'لوحة التحكم',
    template: '%s | لوحة التحكم',
  },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/blogpress');
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        تخطي إلى المحتوى
      </a>
      <header
        className="border-b border-border/50 sticky top-0 z-40 bg-background/80 backdrop-blur-md"
        role="banner"
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/blogpress/dashboard"
              className="flex items-center gap-2.5 transition-smooth hover:opacity-80"
            >
              <Image
                src="/logo.webp"
                alt="BlogPress"
                width={1000}
                height={1000}
                className="size-7"
              />
              <span className="text-base font-bold tracking-tight hidden sm:inline">BlogPress</span>
            </Link>
            <DashboardNav />
          </div>
          <HeaderActions />
        </div>
      </header>
      <main id="main-content" className="flex-1 container mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
