import { MySubmissionsView } from '@/frontend/ui/account/my-submissions-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

export default function AccountSubmissionsPage() {
  return (
    <div className="space-y-6">
      <div className="text-center flex flex-col items-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>طلباتي</SectionTitleHighlight>
        </SectionTitle>
      </div>

      <MySubmissionsView />
    </div>
  );
}
