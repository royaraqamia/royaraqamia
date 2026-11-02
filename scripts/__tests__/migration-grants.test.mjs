import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import { grantedHelpers, policyHelpers, vet } from '../check-migration-grants.mjs';

/**
 * A policy is only half a grant: it runs as the caller, so a helper it names has
 * to be executable by `authenticated`. #867 added a policy over
 * `private.chat_may_add_participant(...)` and revoked the function from every
 * role; production answered `42501 permission denied for function` on every
 * participant insert (every group, and the assistant's own thread) until #871.
 */

const tempDirs = [];

function migration(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'grants-'));
  tempDirs.push(dir);
  const file = join(dir, '20261110120000_example.sql');
  writeFileSync(file, sql);
  return file;
}

const collect = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
};

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('policyHelpers', () => {
  it('names the helpers a policy calls', () => {
    const sql = `
      create policy "Members add a participant"
        on public.chat_participants for insert
        to authenticated
        with check ( private.chat_may_add_participant(conversation_id, auth.uid(), user_id, status) );
    `;

    expect(policyHelpers(sql)).toEqual(['private.chat_may_add_participant']);
  });

  it('ignores statements that are not policies', () => {
    const sql = `
      select private.chat_is_participant(conversation_id, auth.uid()) from public.chat_messages;
      grant execute on function private.chat_can_write(uuid, uuid) to authenticated;
    `;

    expect(policyHelpers(sql)).toEqual([]);
  });
});

describe('grantedHelpers', () => {
  it('reads the schema-qualified name a grant names', () => {
    expect(
      grantedHelpers(`
        grant execute on function private.chat_is_participant(uuid, uuid) to authenticated;
        grant execute on function private.chat_can_write(uuid, uuid) to service_role;
      `)
    ).toEqual(new Set(['private.chat_is_participant']));
  });
});

describe('vetting a policy against the migrations', () => {
  it('passes when the helper is granted somewhere in the history', () => {
    const file = migration(`
      drop policy if exists "Members add a participant" on public.chat_participants;
      create policy "Members add a participant"
        on public.chat_participants for insert
        to authenticated
        with check ( private.chat_may_add_participant(conversation_id, auth.uid(), user_id, status) );
    `);
    const { lines, log } = collect();

    const code = vet(
      [file],
      undefined,
      log,
      'grant execute on function private.chat_may_add_participant(uuid, uuid, uuid, text) to authenticated;'
    );

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('has a grant');
  });

  it('fails when the policy calls a helper nothing grants to authenticated', () => {
    const file = migration(`
      create policy "Members add a participant"
        on public.chat_participants for insert
        to authenticated
        with check ( private.chat_may_add_participant(conversation_id, auth.uid(), user_id, status) );
    `);
    const { lines, log } = collect();

    const code = vet(
      [file],
      undefined,
      log,
      'grant execute on function private.chat_can_write(uuid, uuid) to authenticated;'
    );

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('private.chat_may_add_participant');
    expect(lines.join('\n')).toContain('42501');
  });

  it('does not accept a grant that leaves authenticated out', () => {
    const file = migration(`
      create policy "Members read the roster"
        on public.chat_participants for select
        to authenticated
        using ( private.chat_has_conversation_access(conversation_id, auth.uid()) );
    `);
    const { lines, log } = collect();

    const code = vet(
      [file],
      undefined,
      log,
      'grant execute on function private.chat_has_conversation_access(uuid, uuid) to service_role;'
    );

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('private.chat_has_conversation_access');
  });
});
