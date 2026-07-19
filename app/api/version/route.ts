import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_BUILD_ID ||
    'unknown';

  return NextResponse.json({ version }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
