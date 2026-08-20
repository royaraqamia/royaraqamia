import { requireAuth } from '@/backend/middleware/auth-guard';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';
import { ProgressBar } from '@/frontend/ui/linksnap/progress-bar';

export default async function LinkSnapAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/linksnap/app');

  return (
    <AppShell product="linksnap">
      <ProgressBar />
      {children}
    </AppShell>
  );
}
