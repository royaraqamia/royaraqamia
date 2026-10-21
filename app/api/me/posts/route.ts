import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getMyAccountPosts } from '@/backend/controllers/community';

export async function GET(_req: NextRequest) {
  return toNextResponse(await getMyAccountPosts());
}
