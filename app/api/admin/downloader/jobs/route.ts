import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { listDownloadJobs } from '@/backend/controllers/downloader-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await listDownloadJobs({
      page: Number(searchParams.get('page') ?? 1),
      pageSize: Number(searchParams.get('pageSize') ?? 0),
      status: searchParams.get('status'),
      search: searchParams.get('search'),
    })
  );
}
