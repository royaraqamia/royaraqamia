import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';
import { requireAuth } from '@/backend/middleware/auth-guard';

export const metadata: Metadata = {
  title: 'طلباتي',
  description: 'طلباتك المرسلة من نماذج رؤيَة رَقَميَّة، مع إمكانيَّة تعديلها.',
};

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/account/submissions');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}
