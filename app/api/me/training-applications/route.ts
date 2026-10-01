import { toNextResponse } from '@/backend/transport/http-result';
import { listMyTrainingApplications } from '@/backend/controllers/training';

export async function GET() {
  return toNextResponse(await listMyTrainingApplications());
}
