import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getUnreadNotificationCount } from '@/backend/controllers/notifications';

export async function GET(_req: NextRequest) {
  return toNextResponse(await getUnreadNotificationCount());
}
