import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getDownloadJob } from '@/backend/controllers/downloader';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await getDownloadJob(id));
}
