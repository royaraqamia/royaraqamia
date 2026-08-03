import { getAuthUser } from '@/backend/middleware/auth-guard';
import { AdminValidator } from '@/shared/admin-validator';
import { env } from '@/backend/config/env';
import { LinkSnapAppView } from '@/frontend/ui/linksnap/link-snap-app-view';

export const dynamic = 'force-dynamic';

export default async function LinkSnapAppPage() {
  const { user } = await getAuthUser();
  const isAdmin = user?.email ? AdminValidator.isAdmin(user.email, env.adminEmails) : false;

  return <LinkSnapAppView isAdmin={isAdmin} />;
}
