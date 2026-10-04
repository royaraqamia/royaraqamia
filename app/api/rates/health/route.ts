import { toNextResponse } from '@/backend/transport/http-result';
import { getRatesHealth } from '@/backend/controllers/rates';

export async function GET() {
  return toNextResponse(await getRatesHealth());
}
