import '../leads.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'طلب بناء مشروع',
  description:
    'أخبرنا بالمشروع الذي تريد بناءه: املأ النَّموذج واحصل على رقم طلب فورًا، وسنتواصل معك عبر واتساب.',
};

export default function RequestProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}
