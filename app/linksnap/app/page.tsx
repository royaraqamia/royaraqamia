import { getAuthUser } from '@/backend/middleware/auth-guard';
import { isAdmin } from '@/shared/admin-validator';
import { env } from '@/backend/config/env';
import { LinkSnapAppView } from '@/frontend/ui/linksnap/link-snap-app-view';

export const dynamic = 'force-dynamic';

export default async function LinkSnapAppPage() {
  const { user } = await getAuthUser();
  const admin = user?.email ? isAdmin(user.email, env.adminEmails) : false;

  return <LinkSnapAppView isAdmin={admin} />;
}
