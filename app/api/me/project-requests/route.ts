import { toNextResponse } from '@/backend/transport/http-result';
import { listMyProjectRequests } from '@/backend/controllers/project-requests';

export async function GET() {
  return toNextResponse(await listMyProjectRequests());
}
