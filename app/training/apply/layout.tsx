import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: 'التَّسجيل في التَّدريب',
  description:
    'قدّم طلبك للالتحاق بدورة بناء المنتجات الرقميَّة من الصِّفر: املأ النَّموذج وسنتواصل معك عبر واتساب لتأكيد مقعدك.',
};

export default function TrainingApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}
