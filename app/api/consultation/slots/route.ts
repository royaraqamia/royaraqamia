import { toNextResponse } from '@/backend/transport/http-result';
import { listAvailableSlots } from '@/backend/controllers/consultation';

export async function GET() {
  return toNextResponse(await listAvailableSlots());
}
