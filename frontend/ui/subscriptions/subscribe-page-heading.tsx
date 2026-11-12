import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

/**
 * The `/pricing/subscribe` page heading, written once.
 *
 * The heading lives inside whichever card the reader's state opens — the plan
 * summary, the sign-in panel, or the open request — the way every other form
 * page carries its title in its own card, so it cannot drift apart between the
 * three states.
 */
export function SubscribePageHeading() {
  return (
    <SectionTitle as="h1" size="card">
      <SectionTitleHighlight>الاشتراك في الخطَّة المدفوعة</SectionTitleHighlight>
    </SectionTitle>
  );
}
