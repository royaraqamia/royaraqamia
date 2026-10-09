import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import type { PublicUser } from '@/shared/contracts/users';

function createClient(options: {
  list?: PublicUser[];
  single?: PublicUser | null;
  count?: number;
}) {
  const orFilters: string[] = [];
  const eqFilters: Array<[string, unknown]> = [];
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn((filter: string) => {
      orFilters.push(filter);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: options.list ?? [], error: null })),
    maybeSingle: vi.fn(async () => ({ data: options.single ?? null, error: null })),
    // `count()` awaits the builder directly (head: true, no terminal call).
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: options.list ?? [], error: null, count: options.count ?? 0 }),
  };
  const supabase = { from: vi.fn(() => builder) };
  return { supabase, orFilters, eqFilters };
}

const member: PublicUser = {
  id: 'u-1',
  username: 'ahmad',
  name: 'أحمد',
  avatar_url: null,
  bio: null,
  verified: true,
};

describe('createPublicUsersRepository', () => {
  it('lists the newest members with the public projection', async () => {
    const { supabase, eqFilters } = createClient({ list: [member] });
    const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

    const result = await repo.list(8);

    expect(result).toEqual([member]);
    expect(supabase.from).toHaveBeenCalledWith('users');
    expect(eqFilters).toContainEqual(['verified', true]);
  });

  it('returns the exact roster total, independent of the page size', async () => {
    const { supabase } = createClient({ list: [member], count: 11 });
    const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

    const total = await repo.count();

    expect(total).toBe(11);
  });

  it('sanitizes the search term before it reaches the or() filter', async () => {
    const { supabase, orFilters, eqFilters } = createClient({ list: [member] });
    const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

    await repo.search('ahmad,admin(test)', 5);

    expect(orFilters).toContain('name.ilike.%ahmad admin test%,username.ilike.%ahmad admin test%');
    expect(eqFilters).toContainEqual(['verified', true]);
  });

  it('returns nothing for a term made only of delimiters', async () => {
    const { supabase, orFilters } = createClient({ list: [member] });
    const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

    const result = await repo.search('(),', 5);

    expect(result).toEqual([]);
    expect(orFilters).toHaveLength(0);
  });

  it('lower-cases the handle when resolving a profile', async () => {
    const { supabase, eqFilters } = createClient({ single: member });
    const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

    const result = await repo.getByUsername('Ahmad');

    expect(result).toEqual(member);
    expect(eqFilters).toContainEqual(['username', 'ahmad']);
  });
});
