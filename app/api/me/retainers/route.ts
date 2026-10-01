import { toNextResponse } from '@/backend/transport/http-result';
import { listMyRetainers } from '@/backend/controllers/retainers';

export async function GET() {
  return toNextResponse(await listMyRetainers());
}
