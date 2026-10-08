import { toNextResponse } from '@/backend/transport/http-result';
import { listDownloadPlatforms } from '@/backend/controllers/downloader-admin';

export async function GET() {
  return toNextResponse(await listDownloadPlatforms());
}
