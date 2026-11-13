import { buildAuthorizationServerMetadata } from '@/backend/services/mcp/oauth-metadata';
import { corsHeaders, noStore } from '@/backend/services/mcp/oauth-http';

export const runtime = 'nodejs';

/**
 * The issuer is the configured origin, never `new URL(req.url).origin`
 * (ADR-0178): a self-hosted Next server builds `request.url` from the address it
 * listens on, so behind Render this document advertised
 * `https://localhost:10000` and every OAuth client that trusted it dialled a
 * port on its own machine.
 */
export async function GET() {
  return Response.json(buildAuthorizationServerMetadata(), {
    headers: { ...corsHeaders(), ...noStore() },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
