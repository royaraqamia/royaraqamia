import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>
      <Footer />
    </div>
  );
}
