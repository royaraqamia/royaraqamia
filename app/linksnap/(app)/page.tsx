import { LinkSnapSurface } from '@/frontend/ui/linksnap/linksnap-surface';
import { LinksnapLinksFab } from '@/frontend/ui/linksnap/linksnap-links-fab';

/**
 * A cached, data-free shell (#449, ADR-0073).
 *
 * `LinkSnapSurface` is already a client surface reading the Local Store; the
 * page only carried `force-dynamic`, so the worker never cached its document.
 * Without it the document is static, and an offline reload paints the shortener
 * and the account's links instead of `/offline`.
 *
 * The FAB stays in the route, not in the surface: the homepage draws the same
 * surface under its strip, and the shortener's account door belongs to its page.
 */
export default function LinkSnapAppPage() {
  return (
    <>
      <LinkSnapSurface />
      <LinksnapLinksFab />
    </>
  );
}
