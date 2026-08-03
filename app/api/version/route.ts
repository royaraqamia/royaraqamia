import { NextResponse } from 'next/server';
import { env } from '@/backend/config/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const version = env.version;

  return NextResponse.json({ version }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
