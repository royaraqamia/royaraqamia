import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ThemeProvider } from '@/components/linksnap/theme-provider';
import { ProgressBar } from '@/components/linksnap/progress-bar';
import { Toaster } from 'sonner';

export default async function LinkSnapAppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/linksnap');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <ProgressBar />
      <ThemeProvider>
        <main className="flex-1 pt-24 mx-auto w-full max-w-6xl container-padding pb-8">
          {children}
        </main>
      </ThemeProvider>
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
