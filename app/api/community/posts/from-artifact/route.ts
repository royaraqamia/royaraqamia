import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { createPostFromArtifact } from '@/backend/controllers/blogpress';

/**
 * The artifact door of the community (#1952): a note or an assistant answer is
 * turned into a draft by the id it is known by, and the server reads the text.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = await createPostFromArtifact(body);
  return toNextResponse(result);
}
