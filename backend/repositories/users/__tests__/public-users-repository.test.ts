import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import type { PublicUser } from '@/shared/contracts/users';
import { RepositoryError } from '@/backend/shared/repository-error';

const { loggerError, captureException } = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/backend/shared/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

const DB_ERROR = { message: 'db down', code: 'PGRST500' };
const NO_ROWS = { message: 'no rows', code: 'PGRST116' };

function createClient(options: {
  list?: PublicUser[];
  single?: PublicUser | null;
  count?: number;
  error?: unknown;
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
    limit: vi.fn(async () => ({
      data: options.error ? null : (options.list ?? []),
      error: options.error ?? null,
    })),
    maybeSingle: vi.fn(async () => ({
      data: options.error ? null : (options.single ?? null),
      error: options.error ?? null,
    })),
    // `count()` awaits the builder directly (head: true, no terminal call).
    then: (resolve: (value: unknown) => unknown) =>
      resolve({
        data: options.error ? null : (options.list ?? []),
        error: options.error ?? null,
        count: options.error ? null : (options.count ?? 0),
      }),
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

  describe('read failures (#404)', () => {
    it.each([
      ['list', (repo: ReturnType<typeof createPublicUsersRepository>) => repo.list(8)],
      ['count', (repo: ReturnType<typeof createPublicUsersRepository>) => repo.count()],
      ['search', (repo: ReturnType<typeof createPublicUsersRepository>) => repo.search('ahmad', 5)],
      [
        'getByUsername',
        (repo: ReturnType<typeof createPublicUsersRepository>) => repo.getByUsername('ahmad'),
      ],
      ['getById', (repo: ReturnType<typeof createPublicUsersRepository>) => repo.getById('u-1')],
    ] as const)('rejects %s on a database error', async (operation, call) => {
      const { supabase } = createClient({ error: DB_ERROR });
      const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

      await expect(call(repo)).rejects.toBeInstanceOf(RepositoryError);
      await expect(call(repo)).rejects.toMatchObject({ operation });
      expect(loggerError).toHaveBeenCalled();
    });

    it('returns null from getByUsername only when no row matched', async () => {
      const { supabase } = createClient({ error: NO_ROWS });
      const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

      await expect(repo.getByUsername('missing')).resolves.toBeNull();
    });

    it('returns empty data for a genuinely empty roster and search', async () => {
      const { supabase } = createClient({});
      const repo = createPublicUsersRepository(supabase as unknown as SupabaseClient<Database>);

      await expect(repo.list(8)).resolves.toEqual([]);
      await expect(repo.count()).resolves.toBe(0);
      await expect(repo.search('nobody', 5)).resolves.toEqual([]);
    });
  });
});
