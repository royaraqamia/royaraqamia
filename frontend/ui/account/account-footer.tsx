'use client';

import { usePathname } from 'next/navigation';

import { isPrimaryRoute } from '@/frontend/ui/navbar/route-kind';

/**
 * The installed app's version, at the foot of one page: `/account`, the account
 * area's front page. It is the app's own number, so it belongs where the app is
 * being set up rather than on every screen behind that door — the same split the
 * app chrome makes between a primary route and a secondary one.
 *
 * The layout reads the number off the shell's user agent (ADR-0046) and passes
 * it down, which is what keeps this out of the web: a browser sends no token,
 * and a shell built before it carried a name has no name to show. Both render
 * nothing.
 */
export function AccountFooter({ version }: { version: string | null }) {
  const pathname = usePathname();

  if (!version || !isPrimaryRoute(pathname)) return null;

  return (
    <footer data-account-footer className="text-muted-foreground pb-8 text-center text-xs">
      {version}
    </footer>
  );
}
