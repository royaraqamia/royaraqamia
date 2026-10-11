import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { removeAvatar, uploadAvatar } from '@/backend/controllers/profile';

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => new FormData());
  return toNextResponse(await uploadAvatar(formData, req.headers));
}

export async function DELETE(req: NextRequest) {
  return toNextResponse(await removeAvatar(req.headers));
}
