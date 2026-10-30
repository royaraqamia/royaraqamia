import { NextRequest } from 'next/server';

import { deleteNote, updateNote } from '@/backend/controllers/notes';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { NoteDeleteSchema, NoteUpdateSchema } from '@/shared/contracts/notes';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseBody(NoteUpdateSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await updateNote(id, parsed.data));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A delete may legitimately carry no body at all, so a failed read is an
  // empty one — but a body that *is* there is validated before the repository
  // sees it, rather than cast (a `null` body used to reach `offlineMeta`).
  const parsed = parseBody(NoteDeleteSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await deleteNote(id, parsed.data));
}
