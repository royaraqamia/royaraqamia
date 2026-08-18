import { toNextResponse } from '@/backend/transport/http-result';
import { exportHabitsCsv } from '@/backend/controllers/habitflow';

export async function GET() {
  return toNextResponse(await exportHabitsCsv());
}
