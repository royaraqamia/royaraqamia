import { NextRequest } from 'next/server';

import { getChatAttachment } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * One attachment of one thread. The id alone would not say which thread the
 * caller opened, and the two ids together are what the table's RLS answers:
 * an attachment of another conversation is not found, never signed.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params;
  return toNextResponse(await getChatAttachment(id, attachmentId));
}
