import { ALL_SCOPES } from './scope';
import { env } from '@/backend/config/env';

/**
 * Builds the RFC 9728 Protected Resource Metadata and RFC 8414 Authorization
 * Server Metadata exposed at the `/.well-known/` endpoints so MCP clients can
 * discover the OAuth flow.
 *
 * URLs are derived from the request origin (passed in by the route handlers)
 * so the same metadata works for localhost dev, preview deployments, and the
 * production site. Falls back to `NEXT_PUBLIC_BASE_URL` when no request is
 * available.
 */

export function mcpResourceUrl(base: string): string {
  return `${base}/mcp`;
}

export function mcpBaseUrl(base?: string): string {
  return (base ?? env.baseUrl).replace(/\/$/, '');
}

export interface McpAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
}

export function buildAuthorizationServerMetadata(base?: string): McpAuthorizationServerMetadata {
  const origin = mcpBaseUrl(base);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/mcp/token`,
    registration_endpoint: `${origin}/mcp/register`,
    revocation_endpoint: `${origin}/mcp/revoke`,
    scopes_supported: ALL_SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
  };
}

export interface McpProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

export function buildProtectedResourceMetadata(base?: string): McpProtectedResourceMetadata {
  const origin = mcpBaseUrl(base);
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ['header'],
  };
}
