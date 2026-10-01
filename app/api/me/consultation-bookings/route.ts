import { toNextResponse } from '@/backend/transport/http-result';
import { listMyConsultationBookings } from '@/backend/controllers/consultation';

export async function GET() {
  return toNextResponse(await listMyConsultationBookings());
}
