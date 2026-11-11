import { describe, expect, it } from 'vitest';

import { readAuthChallenge, scopeRequirementSentence } from '@/backend/shared/domain/mcp-remote';

/**
 * The two refusals a provider can answer a call with, and the sentence each one
 * earns (#1230).
 *
 * The header below is the one Supabase answered `execute_sql` with on
 * 2026-11-11, reduced to the fields this side reads. A refresh returns the same
 * grant, so telling them apart here is what keeps a live connection from being
 * reported as a dead one.
 */

const SUPABASE_SCOPE_REFUSAL =
  'Bearer error="insufficient_scope", error_description="This tool requires the database:write OAuth scope.", scope="database:write", resource_metadata="https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp"';

const SUPABASE_TOKEN_REFUSAL =
  'Bearer error="invalid_token", error_description="JWT could not be decoded", resource_metadata="https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp"';

describe('a challenge a refused call carries', () => {
  it('reads the scope refusal and the permission it names', () => {
    expect(readAuthChallenge(SUPABASE_SCOPE_REFUSAL)).toEqual({
      error: 'insufficient_scope',
      scope: 'database:write',
    });
  });

  it('reads a refused token as a refused token, with no permission', () => {
    expect(readAuthChallenge(SUPABASE_TOKEN_REFUSAL)).toEqual({
      error: 'invalid_token',
      scope: null,
    });
  });

  it('answers nothing for a response that carried no challenge', () => {
    expect(readAuthChallenge(null)).toEqual({ error: null, scope: null });
    expect(readAuthChallenge('')).toEqual({ error: null, scope: null });
  });
});

describe('what the member reads', () => {
  it('names the permission the provider asked for', () => {
    const sentence = scopeRequirementSentence('database:write');

    expect(sentence).toContain('database:write');
    expect(sentence).toContain('أعد الربط');
  });

  it('still says what to do when the provider named no permission', () => {
    const sentence = scopeRequirementSentence(null);

    expect(sentence).not.toContain('«');
    expect(sentence).toContain('أعد الربط');
  });
});
