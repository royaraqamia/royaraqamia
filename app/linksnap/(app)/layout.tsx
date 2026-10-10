import type { Metadata } from 'next';
import { requireAuth } from '@/backend/middleware/auth-guard';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';
import { ProgressBar } from '@/frontend/ui/linksnap/progress-bar';

export const metadata: Metadata = {
  title: 'LinkSnap',
  description: 'اختصر روابطك الطَّويلة وتتبَّع أداءها بسهولة مع LinkSnap من رؤيَة رقَميَّة.',
};

export default async function LinkSnapAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/linksnap');

  return (
    <AppShell>
      <ProgressBar />
      {children}
    </AppShell>
  );
}
