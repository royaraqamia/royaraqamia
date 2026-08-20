import { requireAuth } from '@/backend/middleware/auth-guard';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';

export default async function SpendTrackAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/spendtrack/app');

  return <AppShell product="spendtrack">{children}</AppShell>;
}
