import type { Metadata } from 'next';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';
import { MotionRoot } from '@/frontend/ui/MotionRoot';
import { ProgressBar } from '@/frontend/ui/linksnap/progress-bar';

export const metadata: Metadata = {
  title: 'اختصار الرَّوابط',
  description:
    'اختصر روابطك الطَّويلة وتتبَّع أداءها بسهولة مع اختصار الرَّوابط من رؤيَة رقَميَّة.',
};

export default function LinkSnapAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ProgressBar />
      <MotionRoot>{children}</MotionRoot>
    </AppShell>
  );
}
