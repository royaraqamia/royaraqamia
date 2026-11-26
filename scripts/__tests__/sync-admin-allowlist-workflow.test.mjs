import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The allowlist sync is our own endpoint. It used to authenticate with the
 * Supabase service-role key, which put the master database key on an HTTP
 * request to our origin and coupled two unrelated rotations (#1909).
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom.
 */
const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/sync-admin-allowlist.yml'),
  'utf8'
);

describe('the allowlist sync', () => {
  it('carries its own bearer token', () => {
    expect(workflow).toContain('ADMIN_SYNC_SECRET: ${{ secrets.ADMIN_SYNC_SECRET }}');
    expect(workflow).toContain('-H "Authorization: Bearer ${ADMIN_SYNC_SECRET}"');
  });

  it('never sends the Supabase key to our own endpoint', () => {
    expect(workflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
