import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { syncAdminAllowlist } from '@/backend/controllers/admin-allowlist';

export async function POST(req: NextRequest) {
  return toNextResponse(
    await syncAdminAllowlist({
      authorization: req.headers.get('authorization'),
      dryRun: req.nextUrl.searchParams.get('dryRun') === '1',
    })
  );
}
