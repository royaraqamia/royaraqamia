import { requireAuth } from '@/backend/middleware/auth-guard';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';

export default async function BlogPressAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/blogpress');

  return <AppShell product="blogpress">{children}</AppShell>;
}
