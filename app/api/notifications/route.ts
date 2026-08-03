import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { listNotifications, markAllNotificationsRead } from '@/backend/controllers/notifications';

export async function GET(_req: NextRequest) {
  return toNextResponse(await listNotifications());
}

export async function PATCH(_req: NextRequest) {
  return toNextResponse(await markAllNotificationsRead());
}
