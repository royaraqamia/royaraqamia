import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { exportUrlAnalytics } from '@/backend/controllers/linksnap';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await exportUrlAnalytics(req.headers.get('Authorization'), code, searchParams)
  );
}
