import { NextRequest } from 'next/server';
import { listHiddenServices, replaceHiddenServices } from '@/backend/controllers/hidden-services';
import { toNextResponse } from '@/backend/transport/http-result';

/** The services the caller hid from `خدماتنا`, in any order (ADR-0112). */
export async function GET() {
  return toNextResponse(await listHiddenServices());
}

/** Replace the whole hidden set; the body is the settings page's state. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await replaceHiddenServices(body, req.headers));
}
