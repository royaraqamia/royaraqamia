import { getAuthUser } from '@/backend/middleware/auth-guard';
import { AdminValidator } from '@/backend/shared/admin-validator';
import { LinkSnapAppView } from '@/frontend/ui/linksnap/link-snap-app-view';

export const dynamic = 'force-dynamic';

export default async function LinkSnapAppPage() {
  const { user } = await getAuthUser();
  const isAdmin = user?.email ? AdminValidator.isAdmin(user.email) : false;

  return <LinkSnapAppView isAdmin={isAdmin} />;
}
