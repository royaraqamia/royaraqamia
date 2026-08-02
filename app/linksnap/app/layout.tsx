import { requireAuth } from '@/backend/middleware/auth-guard';
import { ThemeProvider } from '@/frontend/ui/linksnap/theme-provider';
import { ProgressBar } from '@/frontend/ui/linksnap/progress-bar';
import { Toaster } from 'sonner';
import { Navbar } from '@/frontend/ui/Navbar';

export default async function LinkSnapAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/linksnap');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
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
