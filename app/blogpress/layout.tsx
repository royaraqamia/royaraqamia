import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { SkipToContent } from '@/components/SkipToContent';

export const metadata: Metadata = {
  title: {
    default: 'BlogPress',
    template: '%s | BlogPress',
  },
};

export default async function BlogPressLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/blogpress');
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SkipToContent />
      <Navbar />
      <main id="main-content" className="flex-1 pt-24 container mx-auto px-4 sm:px-6 pb-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
