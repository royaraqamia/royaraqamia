import { NextRequest } from 'next/server';

import { deleteNote, updateNote } from '@/backend/controllers/notes';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { NoteUpdateSchema } from '@/shared/contracts/notes';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseBody(NoteUpdateSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await updateNote(id, parsed.data));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { updatedAt?: string };
  return toNextResponse(await deleteNote(id, body));
}
