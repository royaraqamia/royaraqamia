import type { Metadata } from 'next';
import { UnlockLinkForm } from '@/frontend/ui/linksnap/unlock-link-form';

export const metadata: Metadata = {
  title: 'فتح رابط محمي',
  description: 'أدخل كلمة المرور لفتح الرابط المحمي.',
};

export default async function UnlockLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <UnlockLinkForm code={code} />;
}
