import { describe, it, expect } from 'vitest';
import { PostSchema } from '@/shared/contracts/blog';

const validPost = {
  title: 'مقال جديد',
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
    const result = PostSchema.safeParse({ title: 'عنوان', slug: 'slug-1' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = PostSchema.safeParse({ title: '', slug: 'slug-1' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('العنوان مطلوب');
  });

  it('rejects an empty slug', () => {
    const result = PostSchema.safeParse({ title: 'عنوان', slug: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a slug with spaces or special characters', () => {
    for (const slug of ['bad slug', 'bad/slug', 'bad!slug', 'slug?x=1']) {
      expect(PostSchema.safeParse({ title: 'عنوان', slug }).success).toBe(false);
    }
  });

  it('accepts slugs with Arabic characters and dashes', () => {
    expect(PostSchema.safeParse({ title: 'عنوان', slug: 'مقال-عربي' }).success).toBe(true);
    expect(PostSchema.safeParse({ title: 'عنوان', slug: 'my_article-123' }).success).toBe(true);
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
      title: 'عنوان',
      slug: 'slug-1',
      content: undefined,
      cover_image: undefined,
    });
    expect(result.success).toBe(true);
  });
});
