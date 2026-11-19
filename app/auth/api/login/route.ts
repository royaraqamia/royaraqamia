import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { login } from '@/backend/controllers/auth';

/**
 * A login answers with JSON, and a session is a cookie on that same response.
 *
 * The Supabase server client writes its auth cookies into the request's cookie
 * store (`backend/config/supabase.ts`). A response built by `NextResponse.json`
 * does not necessarily carry those mutations, which left a 200 with no session
 * behind the visual gate's failed captures (#1574). Copy every value the login
 * changed onto the response explicitly, so a successful answer always carries
 * the cookie the next request needs.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const before = new Map((await cookies()).getAll().map(({ name, value }) => [name, value]));
  const result = await login(body, getClientIp(req));
  const response = toNextResponse(result);

  for (const cookie of (await cookies()).getAll()) {
    if (before.get(cookie.name) === cookie.value) continue;
    // The cookie store exposes names and values only - the options Supabase
    // passed to setAll are not readable back. The session middleware refreshes
    // these cookies with its own options on the next document request, so the
    // defaults here only have to carry the answer across this first response.
    response.cookies.set(cookie.name, cookie.value, {
      path: '/',
      sameSite: 'lax',
      secure: req.nextUrl.protocol === 'https:',
    });
  }

  return response;
}
