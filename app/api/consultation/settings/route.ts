import { toNextResponse } from '@/backend/transport/http-result';
import { getPaymentConfig } from '@/backend/controllers/consultation';

export async function GET() {
  return toNextResponse(await getPaymentConfig());
}
