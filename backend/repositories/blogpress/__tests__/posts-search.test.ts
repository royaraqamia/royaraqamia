import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';

function createClient() {
  const searchFilters: string[] = [];
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn((filter: string) => {
      if (filter.includes('ilike')) searchFilters.push(filter);
      return builder;
    }),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => ({ data: [], count: 0 })),
  };
  const supabase = { from: vi.fn(() => builder) };
  return { supabase, searchFilters };
}

describe('getPublishedPosts search sanitization', () => {
  it('replaces or()-delimiter characters in the search term', async () => {
    const { supabase, searchFilters } = createClient();
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);

    await repo.getPublishedPosts(1, 'hello,world(test)', 10);

    expect(searchFilters).toContain(
      'title.ilike.%hello world test%,meta_desc.ilike.%hello world test%'
    );
  });

  it('skips the search filter when the term is only delimiter characters', async () => {
    const { supabase, searchFilters } = createClient();
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);

    await repo.getPublishedPosts(1, '(),', 10);

    expect(searchFilters).toHaveLength(0);
  });

  it('passes a clean search term through unchanged', async () => {
    const { supabase, searchFilters } = createClient();
    const repo = createPostsRepository(supabase as unknown as SupabaseClient<Database>);

    await repo.getPublishedPosts(1, 'تقنية رقمية', 10);

    expect(searchFilters).toContain('title.ilike.%تقنية رقمية%,meta_desc.ilike.%تقنية رقمية%');
  });
});
