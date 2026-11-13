import { buildProtectedResourceMetadata } from '@/backend/services/mcp/oauth-metadata';
import { corsHeaders, noStore } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

/**
 * The resource and its authorization server are the configured origin, never
 * `new URL(req.url).origin` (ADR-0178) — see the authorization-server document
 * beside this one for what the request-derived version advertised in
 * production.
 */
export async function GET() {
  return Response.json(buildProtectedResourceMetadata(), {
    headers: { ...corsHeaders(), ...noStore() },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
