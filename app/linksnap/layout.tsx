import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ThemeProvider } from '@/components/linksnap/theme-provider';
import { SessionProvider } from '@/components/shared/session-provider';
import { ProgressBar } from '@/components/linksnap/progress-bar';
import { SkipToContent } from '@/components/SkipToContent';
import { GoUpButton } from '@/components/GoUpButton';
import { WhatsAppFloat } from '@/components/WhatsAppFloat';
import { Toaster } from 'sonner';

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
        <SessionProvider>
          <div className="pt-24">{children}</div>
        </SessionProvider>
      </ThemeProvider>
      <Footer />
      <GoUpButton />
      <WhatsAppFloat />
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
