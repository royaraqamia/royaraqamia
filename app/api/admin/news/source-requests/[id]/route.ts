import {
  approveNewsSourceRequest,
  rejectNewsSourceRequest,
} from '@/backend/controllers/news-admin';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';

/**
 * One decision per request, named by `action`, so the two outcomes cannot be
 * confused by a body that happens to carry both shapes.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  if (body?.action === 'approve') {
    return toNextResponse(await approveNewsSourceRequest(id, body));
  }

  if (body?.action === 'reject') {
    return toNextResponse(await rejectNewsSourceRequest(id, body));
  }

  return toNextResponse(jsonResult(400, { success: false, error: 'إجراء غير معروف.' }));
}
