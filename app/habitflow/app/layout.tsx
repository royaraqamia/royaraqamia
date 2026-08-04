import { requireAuth } from '@/backend/middleware/auth-guard';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';

export default async function HabitFlowAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/habitflow');

  return <AppShell product="habitflow">{children}</AppShell>;
}
