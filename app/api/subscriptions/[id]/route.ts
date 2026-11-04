import { toNextResponse } from '@/backend/transport/http-result';
import { updateSubscriptionRequest } from '@/backend/controllers/subscriptions';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateSubscriptionRequest(id, body));
}
