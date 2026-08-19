import { describe, expect, it } from 'vitest';
import {
  mcpResourceUrl,
  mcpBaseUrl,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from '@/backend/services/mcp/oauth-metadata';
import { ALL_SCOPES } from '@/backend/services/mcp/scope';

describe('mcpBaseUrl / mcpResourceUrl', () => {
  it('strips a trailing slash from the base', () => {
    expect(mcpBaseUrl('https://royaraqamia.com/')).toBe('https://royaraqamia.com');
  });

  it('builds the resource URL under /mcp', () => {
    expect(mcpResourceUrl('https://royaraqamia.com')).toBe('https://royaraqamia.com/mcp');
  });
});

describe('buildAuthorizationServerMetadata', () => {
  const meta = buildAuthorizationServerMetadata('https://royaraqamia.com');

  it('uses the origin as issuer', () => {
    expect(meta.issuer).toBe('https://royaraqamia.com');
  });

  it('advertises all OAuth endpoints under /mcp', () => {
    expect(meta.authorization_endpoint).toBe('https://royaraqamia.com/mcp/authorize');
    expect(meta.token_endpoint).toBe('https://royaraqamia.com/mcp/token');
    expect(meta.registration_endpoint).toBe('https://royaraqamia.com/mcp/register');
    expect(meta.revocation_endpoint).toBe('https://royaraqamia.com/mcp/revoke');
  });

  it('advertises all scopes, code flow, and S256 PKCE', () => {
    expect(meta.scopes_supported).toEqual(ALL_SCOPES);
    expect(meta.response_types_supported).toEqual(['code']);
    expect(meta.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(meta.token_endpoint_auth_methods_supported).toEqual(['none', 'client_secret_post']);
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
  });
});

describe('buildProtectedResourceMetadata', () => {
  const meta = buildProtectedResourceMetadata('https://royaraqamia.com');

  it('points resource and authorization server at the right URLs', () => {
    expect(meta.resource).toBe('https://royaraqamia.com/mcp');
    expect(meta.authorization_servers).toEqual(['https://royaraqamia.com']);
  });

  it('advertises all scopes and bearer header auth', () => {
    expect(meta.scopes_supported).toEqual(ALL_SCOPES);
    expect(meta.bearer_methods_supported).toEqual(['header']);
  });
});
