import { getMyNewsPrivateSources } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

/** The reader's own feeds, with the plan's ceiling. */
export async function GET() {
  return toNextResponse(await getMyNewsPrivateSources());
}
