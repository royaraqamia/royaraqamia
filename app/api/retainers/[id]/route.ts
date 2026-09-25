import { toNextResponse } from '@/backend/transport/http-result';
import { updateRetainer } from '@/backend/controllers/retainers';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateRetainer(id, body));
}
