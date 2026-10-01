import { toNextResponse } from '@/backend/transport/http-result';
import { updateMyRetainer } from '@/backend/controllers/retainers';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateMyRetainer(id, body));
}
