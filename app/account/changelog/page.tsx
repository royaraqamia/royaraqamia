import type { Metadata } from 'next';

import { ChangelogView } from '@/frontend/ui/account/changelog-view';

export const metadata: Metadata = {
  title: 'ما الجديد',
  description: 'ملاحظات إصدارات تطبيق الأندرويد.',
};

export default function AccountChangelogPage() {
  return <ChangelogView />;
}
