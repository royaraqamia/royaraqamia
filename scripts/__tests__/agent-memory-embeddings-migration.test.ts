import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * `public.agent_memory_embeddings` is the vector store of ADR-0185 (#1425).
 * There is no local Supabase stack, so the migration is the production code path
 * and these assertions read it: the last file that creates the table.
 *
 * What is pinned is the issue's acceptance and the decisions behind it, not the
 * comment header:
 *
 * - the width is the generation, so another model's vectors cannot be stored or
 *   indexed here without a new table;
 * - a vector dies with its fact and with the account, and one fact has one
 *   vector, which is what makes the backfill idempotent;
 * - the pending view is the one definition of "waiting", including a fact edited
 *   after its vector was built;
 * - recall runs as the caller, not around the policies;
 * - the grants exist, because RLS chooses rows and grants decide whether a role
 *   reaches the object at all.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const CREATE = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.agent_memory_embeddings\s*\(/i;

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

  expect(latest, 'no migration creates public.agent_memory_embeddings').toBeDefined();
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

describe(`public.agent_memory_embeddings (${file})`, () => {
  it('puts pgvector in the non-exposed schema, not in public', () => {
    expect(sql).toContain('create extension if not exists vector with schema extensions');
    expect(sql).not.toMatch(/create extension if not exists vector\s*;/);
  });

  it('fixes the width, because an index cannot be built on an unknown one', () => {
    expect(sql).toContain('embedding extensions.vector(1536) not null');
  });

  it('holds one vector per fact, which is what makes a re-run an upsert', () => {
    expect(sql).toContain('constraint agent_memory_embeddings_memory unique (memory_id)');
  });

  it('deletes the vector with its fact and with the account', () => {
    expect(sql).toContain('references public.agent_memories (id) on delete cascade');
    expect(sql).toContain('references auth.users (id) on delete cascade');
  });

  it('indexes the distance, on the type the column is', () => {
    const index =
      /create index if not exists (\w+) on public\.agent_memory_embeddings using hnsw \(embedding (extensions\.)?vector_cosine_ops\)/.exec(
        sql
      );

    expect(index, 'no hnsw index on the embedding column').not.toBeNull();
    expect(index?.[1]).toBe('idx_agent_memory_embeddings_vector');
    // The operator class carries the width with the column: a 768-wide model has
    // nowhere to put its answer, which is why the change is a new table.
    expect(index?.[2]).toBe('extensions.');
    // The foreign key's own index: an account deletion must not scan the table.
    expect(sql).toContain('on public.agent_memory_embeddings (user_id)');
  });

  it('lets the member read their own vectors and nobody else', () => {
    expect(sql).toContain('alter table public.agent_memory_embeddings enable row level security');
    expect(policies()).toHaveLength(1);

    const [policy] = policies();
    expect(policy?.name).toBe('members read their own embeddings');
    expect(policy?.block).toContain(' for select ');
    expect(policy?.block).toContain(' to authenticated ');
    expect(policy?.block).toContain('user_id = (select auth.uid())');
    expect(sql).not.toMatch(/\bis_admin\b/);
  });

  it('grants no member write: a vector is the service role’s to write', () => {
    expect(sql).toContain('revoke all on public.agent_memory_embeddings from anon, authenticated');
    expect(sql).toContain('grant select on public.agent_memory_embeddings to authenticated');
    expect(sql).toContain('grant all on public.agent_memory_embeddings to service_role');
    expect(sql).not.toContain('grant insert on public.agent_memory_embeddings');
    expect(sql).not.toContain('grant update on public.agent_memory_embeddings');
    expect(sql).not.toContain(
      'grant select, insert, update, delete on public.agent_memory_embeddings'
    );
  });
});

describe('the pending view', () => {
  it('answers for its caller, not as its owner', () => {
    expect(sql).toContain('create or replace view public.agent_embedding_pending');
    expect(sql).toContain('with (security_invoker = true)');
  });

  it('queues a fact with no vector, or one older than the fact', () => {
    expect(sql).toContain("'fact'::text as source_kind");
    expect(sql).toContain('left join public.agent_memory_embeddings e on e.memory_id = m.id');
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
    const definition =
      /create or replace function public\.agent_memory_nearest\(([\s\S]*?)\) returns table[\s\S]*?language sql stable (security \w+)/.exec(
        sql
      );

    expect(definition, 'no agent_memory_nearest definition').not.toBeNull();
    // A definer version would be a door around the owner-only policies.
    expect(definition?.[2]).toBe('security invoker');
    expect(definition?.[1]).toContain('p_query extensions.vector');
    expect(definition?.[1]).toContain('p_limit integer default 6');
  });

  it('pins its search path and grants only the roles that call it', () => {
    expect(sql).toContain('set search_path = public, extensions');
    expect(sql).toContain(
      'grant execute on function public.agent_memory_nearest(uuid, extensions.vector, integer) to authenticated, service_role'
    );
  });

  it('filters deleted facts and one member, and caps what recall can inject', () => {
    expect(sql).toContain('where e.user_id = p_user_id and m.deleted_at is null');
    expect(sql).toContain('order by e.embedding <=> p_query');
    expect(sql).toContain('limit greatest(1, least(coalesce(p_limit, 6), 24))');
  });
});
