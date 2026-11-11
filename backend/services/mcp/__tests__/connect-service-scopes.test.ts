import { describe, expect, it } from 'vitest';

import { requestedScopesFor } from '@/backend/config/mcp-scopes';

/**
 * The permissions a connection asks a provider for (#1230).
 *
 * The set is a decision, recorded per row with the day it was measured, so this
 * pins the decision itself: what Supabase is asked for, what it is not, and that
 * a row nobody measured still asks for nothing at all.
 */

/** The 13 scopes Supabase publishes (`scopes_supported`, read 2026-11-11). */
const PUBLISHED = [
  'organizations:read',
  'projects:read',
  'projects:write',
  'database:write',
  'database:read',
  'analytics:read',
  'secrets:read',
  'edge_functions:read',
  'edge_functions:write',
  'environment:read',
  'environment:write',
  'storage:read',
  'storage:write',
];

describe('the set a row asks for', () => {
  it('is what the tools use, not the widest grant the provider publishes', () => {
    const scopes = requestedScopesFor('com.supabase/mcp');

    expect(scopes).not.toBeNull();
    expect(scopes).toEqual(
      expect.arrayContaining([
        'organizations:read',
        'projects:read',
        'projects:write',
        'database:read',
        'database:write',
      ])
    );
    // Published, used by no tool, and the worst of them to hand a stranger.
    expect(scopes).not.toContain('secrets:read');
    expect(scopes).not.toContain('environment:read');
    expect(scopes).not.toContain('environment:write');
    expect(scopes).not.toContain('storage:read');
    expect(scopes).not.toContain('storage:write');
  });

  it('only names scopes the provider says it supports', () => {
    for (const scope of requestedScopesFor('com.supabase/mcp') ?? []) {
      expect(PUBLISHED).toContain(scope);
    }
  });

  it('asks for nothing on a row nobody measured', () => {
    expect(requestedScopesFor('io.example/notion')).toBeNull();
  });
});
