import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { deleteNotification, markNotificationRead } from '@/backend/controllers/notifications';

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await markNotificationRead(id));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await deleteNotification(id));
}
