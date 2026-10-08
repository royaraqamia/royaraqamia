import { toNextResponse } from '@/backend/transport/http-result';
import { removeDownloadBlock } from '@/backend/controllers/downloader-admin';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await removeDownloadBlock(id));
}
