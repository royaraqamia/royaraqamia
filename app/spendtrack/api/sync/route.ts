import { toNextResponse } from '@/backend/transport/http-result';
import { syncSpendtrack } from '@/backend/controllers/spendtrack';

export async function GET() {
  return toNextResponse(await syncSpendtrack());
}
