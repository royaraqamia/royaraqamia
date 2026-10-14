import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getAppVersion } from '@/backend/controllers/version';

// The payload is frozen at build time (version, release, commit), so this is a
// static route: Next serves it from the build output and the CDN instead of
// invoking a function per request. It backs the post-deploy probe in README.md —
// nothing in the client polls it (ADR-0039).
export const dynamic = 'force-static';

export async function GET(_req: NextRequest) {
  return toNextResponse(await getAppVersion());
}
