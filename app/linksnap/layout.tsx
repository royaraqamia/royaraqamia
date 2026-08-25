import type { Metadata } from 'next';
import { LinkSnapLayout } from '@/frontend/ui/linksnap/linksnap-layout';

export const metadata: Metadata = {
  title: 'LinkSnap',
  description: 'اختصر روابطك الطَّويلة وتتبَّع أداءها بسهولة مع LinkSnap من رؤية رقمية.',
};

export default function LinkSnapLayoutRoute({ children }: { children: React.ReactNode }) {
  return <LinkSnapLayout>{children}</LinkSnapLayout>;
}
