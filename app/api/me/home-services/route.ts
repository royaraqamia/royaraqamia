import { NextRequest } from 'next/server';
import { listHomeServices, replaceHomeServices } from '@/backend/controllers/home-services';
import { toNextResponse } from '@/backend/transport/http-result';

/** The apps the caller keeps on the homepage, in tab order (ADR-0143). */
export async function GET() {
  return toNextResponse(await listHomeServices());
}

/** Replace the whole ordered set; the body is the strip's state. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await replaceHomeServices(body, req.headers));
}
