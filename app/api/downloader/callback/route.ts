import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { recordDownloadCallback } from '@/backend/controllers/downloader';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await recordDownloadCallback(body, req.headers));
}
