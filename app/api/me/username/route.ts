import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { checkUsernameAvailability, updateUsername } from '@/backend/controllers/profile';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await checkUsernameAvailability(searchParams.get('username')));
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await updateUsername(body));
}
