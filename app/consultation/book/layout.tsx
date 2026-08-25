import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';
import { Footer } from '@/frontend/ui/Footer';

export const metadata: Metadata = {
  title: 'حجز استشارة تقنية | رؤية رقمية',
  description:
    'احجز استشارتك التقنية الفردية: اختر الباقة والموعد المناسب، أكمل الدفع عبر شام كاش أو MoneyGram، وأرسل الإيصال عبر واتساب.',
};

export default function ConsultationBookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-24">
        <div className="container mx-auto max-w-4xl px-4 pb-16">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
