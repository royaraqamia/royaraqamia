import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { adminSaveSettings } from '@/backend/controllers/consultation';

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = await adminSaveSettings(body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
