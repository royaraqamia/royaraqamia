import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: {
    default: 'التَّحقُّق من الشَّهادة',
    template: '%s | رؤيَة رقَميَّة',
  },
  description: 'التَّحقُّق من صحَّة وأصالة الشَّهادات الصَّادرة عن رؤيَة رقَميَّة.',
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        {children}
      </main>
    </div>
  );
}
