import { type NextRequest } from 'next/server';

import { cancelMyNewsSourceRequest } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

/** Cancels a link the reader is still waiting on, or clears one that was refused. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await cancelMyNewsSourceRequest(id, req.headers));
}
