import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import {
  getDownloaderSettings,
  updateDownloaderSettings,
} from '@/backend/controllers/downloader-admin';

export async function GET() {
  return toNextResponse(await getDownloaderSettings());
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateDownloaderSettings(body));
}
