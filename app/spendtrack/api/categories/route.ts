import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { createCategory } from '@/backend/controllers/spendtrack';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await createCategory(body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
