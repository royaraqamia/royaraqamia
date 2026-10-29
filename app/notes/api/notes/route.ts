import { NextRequest } from 'next/server';

import { createNote } from '@/backend/controllers/notes';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { NoteWriteSchema } from '@/shared/contracts/notes';

export async function POST(req: NextRequest) {
  const parsed = parseBody(NoteWriteSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await createNote(parsed.data));
}
