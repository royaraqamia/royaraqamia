import { toNextResponse } from '@/backend/transport/http-result';
import { readSession } from '@/backend/controllers/session';

export async function GET() {
  return toNextResponse(await readSession());
}
