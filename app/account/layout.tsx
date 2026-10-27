import './app.css';
import type { Metadata } from 'next';

import { AccountFooter } from '@/frontend/ui/account/account-footer';
import { AccountSiteFooter } from '@/frontend/ui/account/account-site-footer';
import { Navbar } from '@/frontend/ui/Navbar';

export const metadata: Metadata = {
  title: 'حسابي',
  description: 'إدارة حسابك في رؤيَة رَقَميَّة: ملفَّك الشَّخصيّ وطلباتك وإعدادات الدُّخول.',
};

/**
 * Left open to guests on purpose: `/account` renders a sign-in prompt in place
 * of the profile card so the mobile tab lands somewhere useful. Auth-only
 * children (e.g. `/account/submissions`) guard themselves on the client — the
 * session provider answers network failure as "never a logout" — and the views
 * that read server data degrade to their own inline needs-connection states.
 *
 * No `cookies()`/`headers()` call now exists in this subtree's own code. The
 * layout once awaited `headers()` for the shell's version (ADR-0046); #448
 * moved that read into `AccountFooter`, so the whole subtree is static shells
 * the service worker caches and an offline reload paints the account chrome
 * instead of `/offline` (ADR-0031's #448 amendment).
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar reserveSpace />
      <main id="main-content" className="flex-1 pt-6">
        <div className="container mx-auto max-w-3xl px-4 pb-16">{children}</div>
      </main>
      <AccountSiteFooter />
      <AccountFooter />
    </div>
  );
}
