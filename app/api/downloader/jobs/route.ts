import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { createDownloadJob } from '@/backend/controllers/downloader';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await createDownloadJob(body));
}
