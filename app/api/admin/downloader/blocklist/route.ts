import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { addDownloadBlock, listDownloadBlocklist } from '@/backend/controllers/downloader-admin';

export async function GET() {
  return toNextResponse(await listDownloadBlocklist());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await addDownloadBlock(body));
}
