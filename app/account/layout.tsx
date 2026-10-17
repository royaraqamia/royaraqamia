import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { shellVersionNameFromUserAgent } from '@/frontend/shared/shell-update';
import { AccountFooter } from '@/frontend/ui/account/account-footer';
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
 * The installed app's version reaches the page the same way the rest of the
 * shell's state does: in the shell's own user agent (ADR-0046), so only a shell
 * sends it and a browser has nothing to render. This layout only reads it;
 * `AccountFooter` decides whether the page under it is one that shows it.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const shellVersion = shellVersionNameFromUserAgent((await headers()).get('user-agent') ?? '');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col pt-16 lg:pt-20">
      <Navbar />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
      <AccountFooter version={shellVersion} />
    </div>
  );
}
