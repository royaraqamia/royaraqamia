import { syncBlogpress } from '@/backend/controllers/blogpress';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET() {
  return toNextResponse(await syncBlogpress());
}
