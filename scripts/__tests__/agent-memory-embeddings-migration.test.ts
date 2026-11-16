import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { EMBEDDING_GENERATION } from '@/backend/shared/domain/agent-memory';

/**
 * The vector store of ADR-0185 (#1425) at the generation the code reads
 * (#1550). There is no local Supabase stack, so the migration is the production
 * code path and these assertions read it: the last file that creates the
 * generation's own table, wherever the generation currently points.
 *
 * What is pinned is the issue's acceptance and the decisions behind it, not the
 * comment header:
 *
 * - the width is the generation, so another model's vectors cannot be stored or
 *   indexed here without a new table — and it is the width the code expects;
 * - a vector dies with its fact and with the account, and one fact has one
 *   vector, which is what makes the backfill idempotent;
 * - the pending view is the one definition of "waiting", moved to this
 *   generation so the backfill fills it rather than the old table;
 * - recall runs as the caller, and honours the member's per-scope switches;
 * - the grants exist, because RLS chooses rows and grants decide whether a role
 *   reaches the object at all;
 * - nothing is dropped here: the old generation stays readable until its
 *   backfill is done and a person approves the drop.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const TABLE = EMBEDDING_GENERATION.table;
const NEAREST = EMBEDDING_GENERATION.nearestFunction;
const WIDTH = EMBEDDING_GENERATION.dimensions;

const CREATE = new RegExp(
  `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${TABLE}\\s*\\(`,
  'i'
);

/** Comments stripped so prose about a rule cannot satisfy a pin for it. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ');

/** One line, lower case, single-spaced: substrings survive the SQL formatting. */
const flatten = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

function latestDefinition(): { file: string; sql: string } {
  let latest: { file: string; sql: string } | undefined;

  for (const file of readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const source = withoutComments(readFileSync(resolve(migrationsDir, file), 'utf8'));
    if (!CREATE.test(source)) continue;
    latest = { file, sql: flatten(source) };
  }

  expect(latest, `no migration creates public.${TABLE}`).toBeDefined();
  return latest as { file: string; sql: string };
}

const { file, sql } = latestDefinition();

/** Each `create policy "name" ... ;` block, so a clause is read where it lives. */
function policies(): { name: string; block: string }[] {
  const starts = [...sql.matchAll(/create policy "([^"]+)"/g)];
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? sql.length;
    return { name: match[1] as string, block: sql.slice(start, end) };
  });
}

describe(`public.${TABLE} (${file})`, () => {
  it('puts pgvector in the non-exposed schema, not in public', () => {
    expect(sql).toContain('create extension if not exists vector with schema extensions');
    expect(sql).not.toMatch(/create extension if not exists vector\s*;/);
  });

  it('fixes the width the code expects, because an index cannot be built on an unknown one', () => {
    expect(sql).toContain(`embedding extensions.vector(${WIDTH}) not null`);
  });

  it('holds one vector per fact, which is what makes a re-run an upsert', () => {
    expect(sql).toContain(`constraint ${TABLE}_memory unique (memory_id)`);
  });

  it('deletes the vector with its fact and with the account', () => {
    expect(sql).toContain('references public.agent_memories (id) on delete cascade');
    expect(sql).toContain('references auth.users (id) on delete cascade');
  });

  it('indexes the distance, on the type the column is', () => {
    const index = new RegExp(
      `create index if not exists (\\w+) on public\\.${TABLE} using hnsw \\(embedding (extensions\\.)?vector_cosine_ops\\)`
    ).exec(sql);

    expect(index, 'no hnsw index on the embedding column').not.toBeNull();
    expect(index?.[1]).toBe(`idx_${TABLE}_vector`);
    // The operator class carries the width with the column: a model of another
    // width has nowhere to put its answer, which is why the change is a new table.
    expect(index?.[2]).toBe('extensions.');
    // The foreign key's own index: an account deletion must not scan the table.
    expect(sql).toContain(`on public.${TABLE} (user_id)`);
  });

  it('lets the member read their own vectors and nobody else', () => {
    expect(sql).toContain(`alter table public.${TABLE} enable row level security`);
    expect(policies()).toHaveLength(1);

    const [policy] = policies();
    expect(policy?.name).toBe('members read their own embeddings');
    expect(policy?.block).toContain(' for select ');
    expect(policy?.block).toContain(' to authenticated ');
    expect(policy?.block).toContain('user_id = (select auth.uid())');
    expect(sql).not.toMatch(/\bis_admin\b/);
  });

  it('grants no member write: a vector is the service role’s to write', () => {
    expect(sql).toContain(`revoke all on public.${TABLE} from anon, authenticated`);
    expect(sql).toContain(`grant select on public.${TABLE} to authenticated`);
    expect(sql).toContain(`grant all on public.${TABLE} to service_role`);
    expect(sql).not.toContain(`grant insert on public.${TABLE}`);
    expect(sql).not.toContain(`grant update on public.${TABLE}`);
  });

  it('leaves the previous generation in place until its backfill is done', () => {
    expect(sql).not.toMatch(/\bdrop table\b/);
    expect(sql).not.toMatch(/drop function if exists public\.agent_memory_nearest\(/);
  });
});

describe('the pending view', () => {
  it('answers for its caller, not as its owner', () => {
    expect(sql).toContain('create or replace view public.agent_embedding_pending');
    expect(sql).toContain('with (security_invoker = true)');
  });

  it('queues a fact with no vector — or one older than the fact — in this generation', () => {
    expect(sql).toContain("'fact'::text as source_kind");
    expect(sql).toContain(`left join public.${TABLE} e on e.memory_id = m.id`);
    expect(sql).toContain(
      'where m.deleted_at is null and (e.id is null or e.source_updated_at < m.updated_at)'
    );
  });

  it('is readable by the service role, and by nobody else', () => {
    expect(sql).toContain('grant select on public.agent_embedding_pending to service_role');
    expect(sql).not.toContain('grant select on public.agent_embedding_pending to authenticated');
  });
});

describe('the nearest-fact function', () => {
  it('runs as the caller, so the policies it reads are still the boundary', () => {
    const definition = new RegExp(
      `create or replace function public\\.${NEAREST}\\(([\\s\\S]*?)\\) returns table[\\s\\S]*?language sql stable (security \\w+)`
    ).exec(sql);

    expect(definition, `no ${NEAREST} definition`).not.toBeNull();
    // A definer version would be a door around the owner-only policies.
    expect(definition?.[2]).toBe('security invoker');
    expect(definition?.[1]).toContain('p_query extensions.vector');
    expect(definition?.[1]).toContain('p_limit integer default 6');
    expect(definition?.[1]).toContain('p_thread_id uuid default null');
    expect(definition?.[1]).toContain('p_product text default null');
  });

  it('pins its search path and grants only the roles that call it', () => {
    expect(sql).toContain('set search_path = public, extensions');
    expect(sql).toContain(
      `grant execute on function public.${NEAREST}(uuid, extensions.vector, integer, uuid, text) to authenticated, service_role`
    );
  });

  it('reads this generation, filters one member, and honours the member’s switches', () => {
    expect(sql).toContain(`from public.${TABLE} e`);
    expect(sql).toContain('where e.user_id = p_user_id and m.deleted_at is null');
    expect(sql).toContain('left join public.agent_memory_settings s on s.user_id = p_user_id');
    expect(sql).toContain('coalesce(s.account_enabled, true)');
    expect(sql).toContain('coalesce(s.product_enabled, true)');
    expect(sql).toContain('coalesce(s.thread_enabled, true)');
    expect(sql).toContain('order by e.embedding <=> p_query');
    expect(sql).toContain('limit greatest(1, least(coalesce(p_limit, 6), 24))');
  });
});

describe('forgetting a fact', () => {
  it('deletes the vector from this generation and from the one still waiting to be dropped', () => {
    expect(sql).toContain(`delete from public.${TABLE} e`);
    expect(sql).toContain('delete from public.agent_memory_embeddings e');
    // Both forget paths (one fact, one conversation) still guard on the caller.
    expect(sql.match(/m\.user_id = v_user/g)).toHaveLength(4);
  });
});
