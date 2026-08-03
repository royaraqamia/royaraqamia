import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { login } from '@/backend/controllers/auth';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await login(body));
}
