import { toNextResponse } from '@/backend/transport/http-result';
import { getHabitSync } from '@/backend/controllers/habitflow';

export async function GET() {
  return toNextResponse(await getHabitSync());
}
