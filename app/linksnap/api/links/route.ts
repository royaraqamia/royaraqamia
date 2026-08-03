import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { deleteLink, listLinks, updateLink } from '@/backend/controllers/linksnap';

export async function GET(req: NextRequest) {
  return toNextResponse(await listLinks(req.headers.get('Authorization')));
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await updateLink(req.headers.get('Authorization'), body));
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await deleteLink(req.headers.get('Authorization'), searchParams.get('code'))
  );
}
