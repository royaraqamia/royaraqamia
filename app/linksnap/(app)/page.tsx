import { LinkSnapAppView } from '@/frontend/ui/linksnap/link-snap-app-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export const dynamic = 'force-dynamic';

export default function LinkSnapAppPage() {
  return (
    <>
      <header className="mb-10 text-center">
        <SectionTitle as="h1">
          اختصار <SectionTitleHighlight>الرَّوابط</SectionTitleHighlight>
        </SectionTitle>
      </header>
      <LinkSnapAppView />
    </>
  );
}
