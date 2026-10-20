import { describe, it, expect } from 'vitest';
import {
  CommunityIndexQuerySchema,
  CommunitySearchQuerySchema,
  COMMUNITY_INDEX_CURSOR_MAX_LENGTH,
  COMMUNITY_SEARCH_QUERY_MAX_LENGTH,
  PostSchema,
  PostSlugSchema,
} from '@/shared/contracts/community';

const validPost = {
  slug: 'new-post',
  content: 'المحتوى',
  cover_image: 'https://cdn.example.com/img.png',
  meta_title: 'عنوان قصير',
  meta_desc: 'وصف قصير',
};

describe('PostSchema', () => {
  it('accepts a valid post', () => {
    const result = PostSchema.safeParse(validPost);
    expect(result.success).toBe(true);
  });

  it('accepts only the required fields', () => {
    const result = PostSchema.safeParse({ slug: 'slug-1' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty slug', () => {
    const result = PostSchema.safeParse({ slug: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a slug with spaces or special characters', () => {
    for (const slug of ['bad slug', 'bad/slug', 'bad!slug', 'slug?x=1']) {
      expect(PostSchema.safeParse({ slug }).success).toBe(false);
    }
  });

  it('accepts slugs with Arabic characters and dashes', () => {
    expect(PostSchema.safeParse({ slug: 'منشور-عربي' }).success).toBe(true);
    expect(PostSchema.safeParse({ slug: 'my_article-123' }).success).toBe(true);
  });

  it('rejects a meta_title longer than 70 characters', () => {
    const result = PostSchema.safeParse({ ...validPost, meta_title: 'أ'.repeat(71) });
    expect(result.success).toBe(false);
  });

  it('accepts a meta_title of exactly 70 characters (boundary)', () => {
    const result = PostSchema.safeParse({ ...validPost, meta_title: 'أ'.repeat(70) });
    expect(result.success).toBe(true);
  });

  it('rejects a meta_desc longer than 160 characters', () => {
    const result = PostSchema.safeParse({ ...validPost, meta_desc: 'أ'.repeat(161) });
    expect(result.success).toBe(false);
  });

  it('accepts a meta_desc of exactly 160 characters (boundary)', () => {
    const result = PostSchema.safeParse({ ...validPost, meta_desc: 'أ'.repeat(160) });
    expect(result.success).toBe(true);
  });

  it('accepts an optional content and cover_image', () => {
    const result = PostSchema.safeParse({
      slug: 'slug-1',
      content: undefined,
      cover_image: undefined,
    });
    expect(result.success).toBe(true);
  });
});

describe('PostSlugSchema', () => {
  it('accepts a valid slug', () => {
    expect(PostSlugSchema.safeParse('new-post').success).toBe(true);
    expect(PostSlugSchema.safeParse('منشور-عربي').success).toBe(true);
    expect(PostSlugSchema.safeParse('my_article-123').success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(PostSlugSchema.safeParse('  new-post  ').success).toBe(true);
  });

  it('rejects empty, whitespace-only, or oversized slugs', () => {
    expect(PostSlugSchema.safeParse('').success).toBe(false);
    expect(PostSlugSchema.safeParse('   ').success).toBe(false);
    expect(PostSlugSchema.safeParse('أ'.repeat(201)).success).toBe(false);
  });

  it('rejects slugs with spaces or special characters', () => {
    for (const slug of ['bad slug', 'bad/slug', 'bad!slug', 'slug?x=1']) {
      expect(PostSlugSchema.safeParse(slug).success).toBe(false);
    }
  });
});

describe('CommunitySearchQuerySchema', () => {
  it('trims the query', () => {
    expect(CommunitySearchQuerySchema.parse({ q: '  ahmad  ' })).toEqual({ q: 'ahmad' });
  });

  it('accepts a blank query as the "no search" sentinel', () => {
    expect(CommunitySearchQuerySchema.safeParse({ q: '' }).success).toBe(true);
    expect(CommunitySearchQuerySchema.parse({ q: '   ' })).toEqual({ q: '' });
  });

  it('accepts a query of exactly the maximum length', () => {
    const q = 'أ'.repeat(COMMUNITY_SEARCH_QUERY_MAX_LENGTH);
    expect(CommunitySearchQuerySchema.safeParse({ q }).success).toBe(true);
  });

  it('rejects a query longer than the maximum with an Arabic message', () => {
    const result = CommunitySearchQuerySchema.safeParse({
      q: 'أ'.repeat(COMMUNITY_SEARCH_QUERY_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('طويلة جداً');
    }
  });
});

describe('CommunityIndexQuerySchema', () => {
  it('accepts a missing cursor', () => {
    expect(CommunityIndexQuerySchema.parse({ q: '', cursor: null })).toEqual({
      q: '',
      cursor: null,
    });
  });

  it('normalises a blank cursor to the first page', () => {
    expect(CommunityIndexQuerySchema.parse({ q: '', cursor: '   ' })).toEqual({
      q: '',
      cursor: null,
    });
  });

  it('bounds the cursor length', () => {
    const cursor = 'a'.repeat(COMMUNITY_INDEX_CURSOR_MAX_LENGTH + 1);
    const result = CommunityIndexQuerySchema.safeParse({ q: '', cursor });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('مرجع التصفّح');
    }
  });

  it('applies the same query bound as the search route', () => {
    const q = 'أ'.repeat(COMMUNITY_SEARCH_QUERY_MAX_LENGTH + 1);
    expect(CommunityIndexQuerySchema.safeParse({ q, cursor: null }).success).toBe(false);
  });
});
