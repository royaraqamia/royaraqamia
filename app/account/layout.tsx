import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { shellDisplayVersion } from '@/frontend/shared/shell-update';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: 'حسابي',
  description: 'إدارة حسابك في رؤيَة رَقَميَّة: ملفَّك الشَّخصيّ وطلباتك وإعدادات الدُّخول.',
};

/**
 * Left open to guests on purpose: `/account` renders a sign-in prompt in place
 * of the profile card so the mobile tab lands somewhere useful. Auth-only
 * children (e.g. `/account/submissions`) guard themselves.
 *
 * The footer carries the installed app's version, and only a shell ever sees it:
 * the number travels in the shell's user agent (ADR-0046), so a browser sends
 * nothing to render and there is nothing to hide. The same number is what
 * Android shows in the app's info screen — which is the point of it being the
 * APK's own name rather than the counter.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const shellVersion = shellDisplayVersion((await headers()).get('user-agent') ?? '');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
      {shellVersion ? (
        <footer className="text-muted-foreground pb-8 text-center text-xs">
          تطبيق رؤيَة رَقَميَّة {shellVersion}
        </footer>
      ) : null}
    </div>
  );
}
