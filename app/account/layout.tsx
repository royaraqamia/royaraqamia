import type { Metadata } from 'next';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: 'حسابي',
  description: 'إدارة حسابك في رؤيَة رَقَميَّة: ملفَّك الشَّخصيّ وطلباتك وإعدادات الدُّخول.',
};

/**
 * Left open to guests on purpose: `/account` renders a sign-in prompt in place
 * of the profile card so the mobile tab lands somewhere useful. Auth-only
 * children (e.g. `/account/submissions`) guard themselves.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}
