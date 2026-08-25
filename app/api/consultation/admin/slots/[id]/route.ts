import { toNextResponse } from '@/backend/transport/http-result';
import { adminDeleteSlot } from '@/backend/controllers/consultation';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await adminDeleteSlot(id));
}
