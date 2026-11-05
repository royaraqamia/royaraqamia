import { getMyNewsPrivateSources } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The reader's one list: the feeds they hold and the links still on their way
 * (ADR-0130), with the plan's ceiling.
 */
export async function GET() {
  return toNextResponse(await getMyNewsPrivateSources());
}
