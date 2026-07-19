import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ThemeProvider } from '@/components/linksnap/theme-provider';
import { SessionProvider } from '@/components/shared/session-provider';
import { ProgressBar } from '@/components/linksnap/progress-bar';
import { Toaster } from 'sonner';

export default function LinkSnapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <ProgressBar />
      <ThemeProvider>
        <SessionProvider>{children}</SessionProvider>
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
