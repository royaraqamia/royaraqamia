import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { listAdminUsers } from '@/backend/controllers/admin-users';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? undefined;
  const limit = searchParams.get('limit') ?? undefined;
  return toNextResponse(await listAdminUsers({ search, limit }));
}
