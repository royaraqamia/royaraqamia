import { type NextRequest } from 'next/server';

import { deleteMyNewsPrivateSource } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

/** Removes one of the reader's own feeds. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await deleteMyNewsPrivateSource(id, req.headers));
}
