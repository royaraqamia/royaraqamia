import { toNextResponse } from '@/backend/transport/http-result';
import { cancelMyBooking } from '@/backend/controllers/consultation';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await cancelMyBooking(id));
}
