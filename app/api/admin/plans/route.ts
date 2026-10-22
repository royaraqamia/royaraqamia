import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { listPlanUsers } from '@/backend/controllers/plans-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await listPlanUsers({
      search: searchParams.get('search') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    })
  );
}
