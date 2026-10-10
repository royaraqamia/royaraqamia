import type { Metadata } from 'next';
import { requireAuth } from '@/backend/middleware/auth-guard';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';

export const metadata: Metadata = {
  title: {
    default: 'BlogPress',
    template: '%s | BlogPress',
  },
};

export default async function BlogPressAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/blogpress');

  return <AppShell>{children}</AppShell>;
}
