import { toNextResponse } from '@/backend/transport/http-result';
import { updateTrainingCohort } from '@/backend/controllers/training-cohorts';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateTrainingCohort(id, body));
}
