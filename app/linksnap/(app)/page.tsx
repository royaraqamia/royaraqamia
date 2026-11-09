import { LinkSnapSurface } from '@/frontend/ui/linksnap/linksnap-surface';

/**
 * A cached, data-free shell (#449, ADR-0073).
 *
 * `LinkSnapSurface` is already a client surface reading the Local Store; the
 * page only carried `force-dynamic`, so the worker never cached its document.
 * Without it the document is static, and an offline reload paints the shortener
 * and the account's links instead of `/offline`.
 *
 * The surface owns the links door too, so the homepage tab draws it (ADR-0153,
 * amended) — the route renders the page, never a second copy of the FAB.
 */
export default function LinkSnapAppPage() {
  return <LinkSnapSurface />;
}
