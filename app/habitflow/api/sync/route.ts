import { NextRequest } from 'next/server';

import { getHabitSync } from '@/backend/controllers/habitflow';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await getHabitSync(searchParams));
}
