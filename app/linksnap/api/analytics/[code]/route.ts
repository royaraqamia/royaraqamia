import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getUrlAnalytics } from '@/backend/controllers/linksnap';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return toNextResponse(await getUrlAnalytics(req.headers.get('Authorization'), code));
}
