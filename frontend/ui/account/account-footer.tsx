'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { shellVersionNameFromUserAgent } from '@/frontend/shared/shell-update';
import { isPrimaryRoute } from '@/frontend/ui/navbar/route-kind';

/**
 * The installed app's version, at the foot of one page: `/account`, the account
 * area's front page. It is the app's own number, so it belongs where the app is
 * being set up rather than on every screen behind that door — the same split the
 * app chrome makes between a primary route and a secondary one.
 *
 * The number is read here, where it is shown, off the shell's own user agent
 * (ADR-0046). This used to be an `await headers()` in `app/account/layout.tsx`,
 * which made the whole `/account` subtree dynamic and cost it the worker's
 * cache; #448 moved the read into this client component so the layout stays a
 * static shell an offline reload can paint. The first render — server and
 * hydration — is the same nothing, and the effect fills the name in after
 * mount: a browser sends no token, and a shell built before it carried a name
 * has no name to show.
 */
export function AccountFooter() {
  const pathname = usePathname();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    setVersion(shellVersionNameFromUserAgent(navigator.userAgent));
  }, []);

  if (!version || !isPrimaryRoute(pathname)) return null;

  return (
    <footer data-account-footer className="text-muted-foreground pb-8 text-center text-xs">
      {version}
    </footer>
  );
}
