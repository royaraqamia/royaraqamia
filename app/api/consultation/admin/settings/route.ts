import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { adminSaveSettings } from '@/backend/controllers/consultation';

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await adminSaveSettings(body));
}
