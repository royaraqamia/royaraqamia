import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, request } from '@/frontend/transport/http';

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
