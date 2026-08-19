import { NextRequest } from 'next/server';
import { buildProtectedResourceMetadata } from '@/backend/services/mcp/oauth-metadata';
import { corsHeaders, noStore } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const base = new URL(req.url).origin;
  return NextResponse.json(buildProtectedResourceMetadata(base), {
    headers: { ...corsHeaders(), ...noStore() },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
