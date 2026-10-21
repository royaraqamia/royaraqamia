import { LinkSnapAppView } from '@/frontend/ui/linksnap/link-snap-app-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

/**
 * A cached, data-free shell (#449, ADR-0073).
 *
 * `LinkSnapAppView` was already a client surface reading the Local Store; the
 * page only carried `force-dynamic`, so the worker never cached its document.
 * Without it the document is static, and an offline reload paints the shortener
 * and the account's links instead of `/offline`.
 */
export default function LinkSnapAppPage() {
  return (
    <>
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>اختصار الرَّوابط</SectionTitleHighlight>
        </SectionTitle>
      </header>
      <LinkSnapAppView />
    </>
  );
}
