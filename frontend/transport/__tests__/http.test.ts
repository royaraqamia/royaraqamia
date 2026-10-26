import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, isResponseKeepable, request, requestWithMeta } from '@/frontend/transport/http';

const NETWORK_MESSAGE = 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.';
const FALLBACK_MESSAGE = 'تعذّر إتمام الطلب. أعد المحاولة.';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected request() to reject');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('turns a rejected fetch into an Arabic ApiError with no status', async () => {
    const cause = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));

    const error = await captureError(request('/api/community/posts'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe(NETWORK_MESSAGE);
    expect(error.status).toBeUndefined();
    expect(error.isNetworkError).toBe(true);
    expect(error.cause).toBe(cause);
  });

  it('falls back to Arabic when a 500 has no body to read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
      })
    );

    const error = await captureError(request('/api/spendtrack/categories'));

    expect(error.message).toBe(FALLBACK_MESSAGE);
    expect(error.status).toBe(500);
    expect(error.isNetworkError).toBe(false);
  });

  it('falls back to Arabic when a 500 body carries no message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));

    const error = await captureError(request('/api/linksnap/links'));

    expect(error.message).toBe(FALLBACK_MESSAGE);
    expect(error.status).toBe(500);
  });

  it('keeps a server-provided error verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(400, { success: false, error: 'رسالة عربية' }))
    );

    const error = await captureError(request('/api/downloader/jobs'));

    expect(error.message).toBe('رسالة عربية');
    expect(error.status).toBe(400);
    expect(error.isNetworkError).toBe(false);
  });

  it('accepts a server-provided message when there is no error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(503, { success: false, message: 'الخدمة متوقفة مؤقتًا.' }))
    );

    const error = await captureError(request('/api/blogpress/posts'));

    expect(error.message).toBe('الخدمة متوقفة مؤقتًا.');
    expect(error.status).toBe(503);
  });

  it('still throws for success:false on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { success: false, error: 'تعذّر الحفظ.' }))
    );

    const error = await captureError(request('/api/account/profile'));

    expect(error.message).toBe('تعذّر الحفظ.');
    expect(error.status).toBe(200);
  });

  it('returns the parsed body unchanged on success', async () => {
    const body = { success: true, data: { id: 'abc' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, body)));

    await expect(request('/api/community/posts')).resolves.toEqual(body);
  });
});
/**
 * The snapshot writer's half of the redaction rule (#555).
 *
 * A public surface keeps the answer it rendered, but only when the server did
 * not forbid a copy: `no-store` and `private` are exactly that prohibition, and
 * an absent header is not one. This is where the prohibition is read, beside the
 * response that carries it.
 */
describe('requestWithMeta', () => {
  it('reports a public answer as keepable and returns its body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Cache-Control': 'public, max-age=0, must-revalidate' }),
        json: vi.fn().mockResolvedValue({ value: 1 }),
      })
    );

    await expect(requestWithMeta<{ value: number }>('/api/news/board')).resolves.toEqual({
      data: { value: 1 },
      keepable: true,
    });
  });

  it.each(['no-store', 'private, max-age=0', 'max-age=0, private'])(
    'reports %s as not keepable',
    async (cacheControl: string) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'Cache-Control': cacheControl }),
          json: vi.fn().mockResolvedValue({ value: 1 }),
        })
      );

      const result = await requestWithMeta('/api/news/board');

      expect(result.keepable).toBe(false);
    }
  );

  it('treats an absent header as no prohibition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({}),
      })
    );

    await expect(requestWithMeta('/api/news/board')).resolves.toMatchObject({ keepable: true });
  });

  it('keeps the error contract of the plain request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ error: 'حدث خطأ' }),
      })
    );

    const error = await captureError(requestWithMeta('/api/news/board'));

    expect(error.status).toBe(500);
    expect(error.message).toBe('حدث خطأ');
  });

  it('is the same decision isResponseKeepable makes', () => {
    expect(isResponseKeepable({ headers: new Headers() } as Response)).toBe(true);
    expect(
      isResponseKeepable({ headers: new Headers({ 'cache-control': 'no-store' }) } as Response)
    ).toBe(false);
  });
});
