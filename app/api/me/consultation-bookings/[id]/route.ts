import { toNextResponse } from '@/backend/transport/http-result';
import { updateMyConsultationBooking } from '@/backend/controllers/consultation';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateMyConsultationBooking(id, body));
}
