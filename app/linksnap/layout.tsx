import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ThemeProvider } from '@/components/linksnap/theme-provider';
import { ProgressBar } from '@/components/linksnap/progress-bar';
import { SkipToContent } from '@/components/SkipToContent';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'LinkSnap',
  description: 'اختصر روابطك الطَّويلة وتتبَّع أداءها بسهولة مع LinkSnap من رؤية رقمية.',
};

export default async function LinkSnapLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/linksnap');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SkipToContent />
      <Navbar />
      <ProgressBar />
      <ThemeProvider>
        <div className="pt-24">{children}</div>
      </ThemeProvider>
      <Footer />
      <Toaster
        position="top-center"
        richColors
        closeButton
        dir="rtl"
        toastOptions={{
          style: { fontFamily: 'var(--font-sans)' },
        }}
      />
    </div>
  );
}
