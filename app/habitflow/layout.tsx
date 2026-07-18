import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export default function HabitFlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
