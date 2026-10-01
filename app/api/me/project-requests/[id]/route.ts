import { toNextResponse } from '@/backend/transport/http-result';
import { updateMyProjectRequest } from '@/backend/controllers/project-requests';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateMyProjectRequest(id, body));
}
