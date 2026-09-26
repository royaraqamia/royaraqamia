import { describe, it, expect, vi, beforeEach } from 'vitest';

const { revalidatePath, revalidateTag } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath, revalidateTag }));

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      kind: 'json',
      body,
      status: init?.status,
      headers: init?.headers,
    })),
    redirect: vi.fn((url: string, status: number) => ({ kind: 'redirect', url, status })),
  },
}));

import {
  jsonResult,
  toNextResponse,
  type HttpRedirectResult,
} from '@/backend/transport/http-result';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toNextResponse invalidation', () => {
  it('applies exactly the paths and tags a mutation result carries', () => {
    const result = jsonResult(
      200,
      { success: true },
      {
        revalidate: [{ path: '/blog' }, { path: '/spendtrack', type: 'layout' }],
        tags: ['blog-index', 'blog-post'],
      }
    );

    toNextResponse(result);

    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, '/blog', undefined);
    expect(revalidatePath).toHaveBeenNthCalledWith(2, '/spendtrack', 'layout');
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenNthCalledWith(1, 'blog-index', 'minutes');
    expect(revalidateTag).toHaveBeenNthCalledWith(2, 'blog-post', 'minutes');
  });

  it('invalidates nothing when a result carries no hints (a read)', () => {
    toNextResponse(jsonResult(200, { posts: [] }));

    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('invalidates nothing for a redirect', () => {
    const result: HttpRedirectResult = { status: 307, redirect: 'https://example.com' };

    toNextResponse(result);

    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe('toNextResponse response construction', () => {
  it('builds the JSON response from the result', () => {
    const response = toNextResponse(
      jsonResult(201, { id: 'n-1' }, { headers: { 'X-Test': 'yes' } })
    );

    expect(response).toMatchObject({
      kind: 'json',
      body: { id: 'n-1' },
      status: 201,
      headers: { 'X-Test': 'yes' },
    });
  });

  it('builds the redirect response from the result', () => {
    const response = toNextResponse({ status: 302, redirect: '/somewhere' });

    expect(response).toMatchObject({ kind: 'redirect', url: '/somewhere', status: 302 });
  });
});
