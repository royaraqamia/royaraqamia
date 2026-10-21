import { toNextResponse } from '@/backend/transport/http-result';
import { getDefaultCategories } from '@/backend/controllers/spendtrack';

/**
 * The shared default categories, for seeding a guest's Local Store (#449).
 * Never-cache by prefix (`/spendtrack/api`), so the SWR cache never holds it.
 */
export async function GET() {
  return toNextResponse(await getDefaultCategories());
}
