import type { Metadata } from 'next';
import { ShellHeader } from '@/frontend/ui/app-shell/shell-header';

export const metadata: Metadata = {
  title: 'حجز استشارة',
  description:
    'احجز استشارتك: اختر الباقة والموعد المناسب، أكمِل الدَّفع عبر ShamCash أو MoneyGram، وأرسل الإيصال عبر واتساب.',
};

export default function ConsultationBookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <ShellHeader />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-4xl px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}
